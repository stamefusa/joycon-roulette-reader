const defaultRumble = [0x00, 0x01, 0x40, 0x40];
const nullRumble = [0x00, 0x00, 0x00, 0x00];

export class Rumble {
    private _data: Buffer | number[];
    static fromValues(highFreq: number, highLevel: number, lowFreq: number, lowLevel: number) {
        throw new Error('Not implemented');
    }

    static fromBuffer(data: Buffer | number[] = defaultRumble): Rumble {
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
