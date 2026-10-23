import { screen } from '@testing-library/react-native';

export async function expectProblem(testID: string, headline: string, supporting: string | null = null): Promise<void> {
  await screen.findByTestId(testID);
  expect(screen.getByTestId(`${testID}-text-headline`)).toHaveTextContent(headline, { exact: true });
  if (supporting === null) {
    expect(screen.queryByTestId(`${testID}-text-supporting`)).not.toBeOnTheScreen();
    return;
  }
  expect(screen.getByTestId(`${testID}-text-supporting`)).toHaveTextContent(supporting, { exact: true });
}
