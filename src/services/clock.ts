/** Injectable clock so services are deterministic under test. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
