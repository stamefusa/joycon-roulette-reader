import { Byte } from './common.js';

const CRC8_TABLE: Byte[] = [];

for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
        if (crc & 0x80) {
            crc = (crc << 1) ^ 0x07;
        } else {
            crc <<= 1;
        }
    }
    CRC8_TABLE[i] = (crc & 0xFF) as Byte;
}

function crc8(data: number[] | Buffer): Byte {
    let cc: Byte = 0x00;
    for (let byte of data) {
        cc = CRC8_TABLE[(cc ^ byte) & 0xFF];
    }
    return cc;
}

export { crc8 };