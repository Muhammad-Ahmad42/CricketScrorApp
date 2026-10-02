import type { AudioPlayer, AudioSource } from 'expo-audio';
import type { SoundDriver, SoundName } from '../feedback/feedback';

type AudioModule = typeof import('expo-audio');

const VOLUME = 0.6;

const RUN: AudioSource = require('../../../assets/sounds/run.wav');
const BOUNDARY: AudioSource = require('../../../assets/sounds/boundary.wav');
const WICKET: AudioSource = require('../../../assets/sounds/wicket.wav');
const RESULT: AudioSource = require('../../../assets/sounds/result.wav');

export const SOUND_SOURCES: { readonly [K in SoundName]: AudioSource } = {
  run: RUN,
  boundary: BOUNDARY,
  wicket: WICKET,
  result: RESULT,
};

function loadAudio(): AudioModule {
  const audio: AudioModule = require('expo-audio');
  return audio;
}

export function createExpoSoundDriver(sources: { readonly [K in SoundName]: AudioSource } = SOUND_SOURCES, load: () => AudioModule = loadAudio): SoundDriver {
  const players = new Map<SoundName, AudioPlayer>();
  let audio: AudioModule | null = null;
  const module = (): AudioModule => {
    if (audio === null) {
      audio = load();
      audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
    }
    return audio;
  };
  const playerFor = (sound: SoundName): AudioPlayer => {
    const existing = players.get(sound);
    if (existing !== undefined) {
      return existing;
    }
    const player = module().createAudioPlayer(sources[sound]);
    player.volume = VOLUME;
    players.set(sound, player);
    return player;
  };
  return {
    play(sound) {
      const player = playerFor(sound);
      player
        .seekTo(0)
        .catch(() => undefined)
        .finally(() => player.play());
    },
  };
}
