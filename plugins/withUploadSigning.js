const { withAppBuildGradle } = require('expo/config-plugins');

const LOADER = `def scorebookUploadFile = new File(System.getProperty("user.home"), ".scorebook/upload.properties")
def scorebookUpload = new Properties()
def scorebookUploadReady = scorebookUploadFile.exists()
if (scorebookUploadReady) {
    scorebookUploadFile.withInputStream { scorebookUpload.load(it) }
}

`;

const RELEASE_CONFIG = `
        release {
            if (scorebookUploadReady) {
                storeFile new File(scorebookUploadFile.parentFile, scorebookUpload.getProperty("storeFile"))
                storePassword scorebookUpload.getProperty("storePassword")
                keyAlias scorebookUpload.getProperty("keyAlias")
                keyPassword scorebookUpload.getProperty("keyPassword")
            }
        }`;

module.exports = function withUploadSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (contents.includes('scorebookUploadReady')) {
      return mod;
    }
    contents = contents.replace(/\nandroid \{/, `\n${LOADER}android {`);
    contents = contents.replace(/(signingConfigs \{)/, `$1${RELEASE_CONFIG}`);
    contents = contents.replace(
      /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig scorebookUploadReady ? signingConfigs.release : signingConfigs.debug',
    );
    mod.modResults.contents = contents;
    return mod;
  });
};
