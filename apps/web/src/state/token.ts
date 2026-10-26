// The write token, kept in memory for this browser tab only (decision PQ-03). It is never
// stored on disk or built into the dashboard.
let token: string | undefined;

export const writeToken = {
  get: (): string | undefined => token,
  set: (value: string) => {
    token = value;
  },
  clear: () => {
    token = undefined;
  },
};
