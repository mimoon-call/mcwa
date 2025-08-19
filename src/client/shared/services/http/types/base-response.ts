export type BaseResponse<T extends object = Record<never, never>> = { returnCode: number } & T;
