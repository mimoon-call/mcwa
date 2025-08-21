export type WAWarmUpdate = {
  phoneNumber1: string;
  phoneNumber2: string;
  totalMessages: number;
  sentMessages?: number;
  unsentMessages?: number;
  startInSeconds?: number;
};

export type WAActiveWarm = Pick<WAWarmUpdate, 'phoneNumber1' | 'phoneNumber2'>;
