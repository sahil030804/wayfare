export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const isValidUpi = (value: string) =>
  /^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,100}$/.test(value);
