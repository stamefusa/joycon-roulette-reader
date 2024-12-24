import type { IntRange } from 'type-fest'
export type Byte = IntRange<0, 256>;
export function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}