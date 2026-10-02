export const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
};

export function resetRouter(): void {
  mockRouter.push.mockReset();
  mockRouter.back.mockReset();
  mockRouter.replace.mockReset();
}

export const routerModule = {
  useRouter: () => mockRouter,
};
