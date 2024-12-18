const HID = require('node-hid');
const EventEmitter = require('events');


const VENDOR_ID = 1406;
const PRODUCT_ID = 8199;

const defaultRumble = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];

let tempCounter = 0;

const CRC8_TABLE = [];
for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
        if (crc & 0x80) {
            crc = (crc << 1) ^ 0x07;
        } else {
            crc <<= 1;
        }
    }
    CRC8_TABLE[i] = crc & 0xFF;
}

function calculateCRC8(data) {
    let crc = 0x00;
    for (let byte of data) {
        crc = CRC8_TABLE[(crc ^ byte) & 0xFF];
    }
    return crc;
}

// 例として、データのCRC8を計算
const exampleData = [0x01, 0x02, 0x03, 0x04];
const crc8 = calculateCRC8(exampleData);
console.log(`CRC8: ${crc8.toString(16)}`);

class Joycon extends EventEmitter {
    constructor() {
        super();
        this.device = null;
        this.packetNumber = 0;
        this.latestReports = {};
    }

    findDevices() {
        const devices = HID.devices();
        for (const device of devices) {
            if (device.vendorId === VENDOR_ID && device.productId === PRODUCT_ID) {
                // tentatively only returns the first device
                return [device];
            }
        }
        return [];
    }

    openDevice(deviceInfo) {
        this.close();
        this.device = new HID.HID(deviceInfo.vendorId, deviceInfo.productId);
        this.device.on('data', this._dataReceived.bind(this));
        this.device.on('error', this._onError.bind(this));
    }

    close() {
        if (this.device !== null) {
            this.device.close();
        }
    }

    getLatestReport(cmdId) {
        return this.latestReports[cmdId];
    }

    _dataReceived(data) {
        const typeNames = {
            0x21: "Standard",
            0x23: "NFC/IR",
            0x30: "Standard Full",
            0x31: "NFC/IR MCU",
            0x32: "Unknown 0x32",
            0x33: "Unknown 0x33",
            0x3F: "Input",
        }

        //console.log(data.toString('hex'));
        //console.log(data);

        const type = data.readUInt8();
        //console.log(`Data received: ${typeNames[type]}`);

        switch(type) {
            case 0x21:
                this._processStandard(data);
                return;
            case 0x30:
                this._processStandardFull(data);
                return;
            case 0x31:
                this._processMCU(data);
                return;
            default:
                console.log("Not implemented");
        }
    }

    _processStandard(data) {
        let offset = 0;
        let info = {
            reportId: Buffer.from([data.readUInt8(offset++)]).toString('hex'),
            timer: data.readUInt8(offset++)
        };
            
        const batcon = data.readUInt8(offset++);
        info.batteryLevel = (batcon >> 5) & 0x7;
        info.connectionInfo = batcon & 0x3;
        info.buttonInfo = data.subarray(offset, offset+3); offset+=3;
        info.leftAnalog = data.subarray(offset, offset+3); offset+=3;
        info.rightAnalog = data.subarray(offset, offset+3); offset+=3;
        info.vibrator = data.readUInt8(offset++);
        info.subcmdAck = data.readUInt8(offset++);
        info.subcmdId = data.readUInt8(offset++);
        info.subcmdIdHex = "0x" + Buffer.from([info.subcmdId]).toString('hex');
        info.subcmdReply = data.subarray(offset, offset+35); offset+=35;

        this.latestReports[info.subcmdId] = {
            reply: info.subcmdReply,
            ack: info.subcmdAck
        };

        if(info.subcmdId != 0) console.log(info);

    }


    _processStandardFull(data) {
        const standardData = data.subarray(0, 49);
        //console.log(standardData);
        this.emit('standard', standardData);
    }

    _processMCU(data) {
        const mcuData = data.subarray(49);
        if (tempCounter++ % 10 === 0) {
        //if(mcuData[0] !== 0xff) {
            //console.log(data.toString('hex'));
        }
    }

    // Send 0x01 without rumble and subcommand
    async sendSubcmdAsync(subcmd, parameters = []) {
        return this.sendOutputReportAsync(0x01, [...defaultRumble, subcmd, ...parameters]);
    }

    // Send 0x01 with rumble data and subcommand
    async sendRumbleAndSubcmdAsync(rumble = defaultRumble, subcmd, parameters = []) {
        return this.sendOutputReportAsync(0x01, [...rumble, subcmd, ...parameters]);
    }

    async sendOutputReportAsync(id, data) {
        this.latestReports = {};
        const rawData = Buffer.from([id, this.getNextPacketNumber(), ...data]);
        console.log(rawData);
        return this.device.write(rawData);
    }

    getNextPacketNumber() {
        return this.packetNumber++ & 0xF;
    }

    async _sendRawAsync(data) {
        return this.device.writeAsync(data);
    }

    _onError(err) {
        console.error("Error received from device", err);
    }
}

class SubcommandParameter {
    constructor() {
        this.data = [];
    }

    static fromArray(data) {
        const param = new SubcommandParameter();
        param.data = data;
        return param;
    }

    appendUInt8(value) {
        this.data.push(value & 0xFF);
    }

    appendUInt16(value) {
        this.appendUInt8(value & 0xFF);
        this.appendUInt8((value >> 8) & 0xFF);
    }

    appendUInt32(value) {
        this.appendUInt16(value & 0xFFFF);
        this.appendUInt16((value >> 16) & 0xFFFF);
    }

    appendBuffer(buffer) {
        for (const byte of buffer) {
            this.appendUInt8(byte);
        }
    }

    getArray() {
        return this.data;
    }
}

module.exports = {
    Joycon,
    SubcommandParameter
};