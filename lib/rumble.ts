const defaultRumble = [0x00, 0x01, 0x40, 0x40];
const nullRumble = [0x00, 0x00, 0x00, 0x00];

export class Rumble {
    private _data: Buffer | number[];
    static fromValues(highFreq: number, highAmp: number, lowFreq: number, lowAmp: number) {
        const highFreqByte = Math.round(Math.log2(highFreq/10.0)*32.0);
        throw new Error('Not implemented');
    }

    static fromBuffer(data: Buffer | number[] = defaultRumble): Rumble {
        if (data.length !== 4) {
            throw new Error('Invalid rumble data');
        }

        const rumble = new Rumble();
        rumble._data = data;

        return rumble;
    }

    static get defaultRumble(): Rumble {
        return Rumble.fromBuffer(defaultRumble);
    }

    static get nullRumble(): Rumble {
        return Rumble.fromBuffer(nullRumble);
    }

    get data(): Buffer | number[] {
        return this._data;
    }
}
