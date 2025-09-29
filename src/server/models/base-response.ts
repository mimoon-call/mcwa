export type BaseResponse<T extends object = Record<never, never>> = ({ returnCode: 0 } & T) | { returnCode: number };
