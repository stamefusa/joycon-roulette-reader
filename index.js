import HID from 'node-hid';
import {Joycon} from './joycon.js';
import crc8 from 'crc/crc8';

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

const joycon = new Joycon();

const devices = joycon.findDevices();

console.log(devices);

if(devices.length === 0) {
    console.error("No devices found");
    process.exit(1);
}

joycon.openDevice(devices.shift());

const rumble = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];
//const rumble = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
let buf = [];

if(false) {
    // request device info
    //joycon.sendPacket(0x01, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02]);
    // with rumble
    //joycon.sendPacket(0x01, [0x04, 0x40, 0x40, 0x01, 0x04, 0x40, 0x40, 0x01, 0x02]);

    // default state
    await joycon.sendOutputReportAsync(0x01, [...rumble, 0x03, 0x3F]);
} else {

    // Set shipment state
    await joycon.sendSubcmdAsync(0x08, [0x00]);
    await sleep(150);
    console.log(joycon.getLatestReport(0x08));

    // Set input mode: standard full @60Hz
    await joycon.sendSubcmdAsync(0x03, [0x30]);
    await sleep(150);
    console.log(joycon.getLatestReport(0x03));


    // Set trigger button elapsed time
    await joycon.sendSubcmdAsync(0x04, [0x00]);
    await sleep(150);
    console.log(joycon.getLatestReport(0x04));

    // Enable IMU
    await joycon.sendSubcmdAsync(0x40, [0x02]);
    await sleep(150);
    console.log(joycon.getLatestReport(0x40));

    // Enable vibration
    await joycon.sendSubcmdAsync(0x48, [0x01]);
    await sleep(150);
    console.log(joycon.getLatestReport(0x48));

    // step1: Resume MCU / Set MCU state
    await joycon.sendSubcmdAsync(0x22, [0x01])
    await sleep(150);
    console.log(joycon.getLatestReport(0x22));

    // Set LED
    await joycon.sendSubcmdAsync(0x30, [0x03])
    await sleep(150);
    console.log(joycon.getLatestReport(0x30));


    // Set LED
    await joycon.sendSubcmdAsync(0x30, [0x0C])
    await sleep(150);
    console.log(joycon.getLatestReport(0x30));

    // MCU data 21 21 0 0 
    buf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    console.log(`Length of buf: ${buf.length}`);
    await joycon.sendSubcmdAsync(0x21, [0x21, ...buf]);
    await sleep(300);
    console.log(joycon.getLatestReport(0x21));

    await joycon.sendSubcmdAsync(0x22, [0]);
    await sleep(300);
    console.log(joycon.getLatestReport(0x22));

    await sleep(1000);


    console.log("========== Initializing Roulette ==========");


    await joycon.sendSubcmdAsync(0x22, [1]);
    await sleep(300);
    console.log(joycon.getLatestReport(0x22));

    // step3: (while) Enable MCU polling? (Enable MCU ext device?)
    // send a2 1 8 0 0 0 0 0 0 0 0 21 21 0 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 fa
    // returns  
    //  ready: (a0) 21 1 32 0 0 8 0 1b 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 80
    //  not ready: (a0) 21 1 0 0 0 8 0 1b 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 48
    buf = Buffer.from([0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    console.log(`Length of buf: ${buf.length}`);
    while(true) {
        await joycon.sendSubcmdAsync(0x21, [0x21, ...buf, crc8(buf)]);
        await sleep(300);
        const latestReport21 = joycon.getLatestReport(0x21);
        if (!latestReport21) continue;
        console.log(latestReport21.reply);
        if(latestReport21.reply[0] == 0x01 && latestReport21.reply[1] == 0x32) {
            console.log("MCU ready");
            break;
        }

    }

    // 21 21 1 1
    // send: 01 0e 00 01 40 40 00 01 40 40 21 21 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 f3
    buf = Buffer.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    console.log(`Length of buf: ${buf.length}`);
    await joycon.sendSubcmdAsync(0x21, [0x21, ...buf, crc8(buf)]);
    await sleep(300);
    console.log(joycon.getLatestReport(0x21));

    /*
    // step5: MCU data 21 21 1 1
    buf = Buffer.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    await joycon.sendSubcmdAsync(0x21, [0x21, ...buf, crc8(buf)]);
    //await joycon.sendOutputReportAsync(0x01, [...rumble, 0x21, 0x21, ...buf, crc8(buf)]);
    await sleep(300);
    console.log(joycon.getLatestReport(0x21));
    */


    // step6: ext data (external device info)
    //await joycon.sendOutputReportAsync(0x01, [...rumble, 0x59, ...buf]);
    await sleep(300);
    const latestReport59 = joycon.getLatestReport(0x59);
    if(latestReport59.reply[1] !== 0x29 || latestReport59.reply[0] !== 0x00) {
        //ルーレット attached if sub response[1] == 29 or ((uint16*)&subresponse[0]) == 0x0001
        console.log("Roulette not attached");
        process.exit(1);
    }
 

    // step7: enable IMU
    await joycon.sendSubcmdAsync(0x40, [0x03]);
    await sleep(200);
    console.log(joycon.getLatestReport(0x40)); 

    // Get ext device info
    /*
    buf = Buffer.from([0x06, 0x03, 0x25, 0x06, 0x00, 0x00, 0x00, 0x00, 0x1C, 0x16, 0xED, 0x34, 0x36,
        0x00, 0x00, 0x00, 0x0A, 0x64, 0x0B, 0xE6, 0xA9, 0x22, 0x00, 0x00, 0x04, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x90, 0xA8, 0xE1, 0x34, 0x36]);
    */
    buf = Buffer.from([0x06, 0x03, 0x25, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    
    await joycon.sendSubcmdAsync(0x5C, buf);
    await sleep(300);
    console.log(joycon.getLatestReport(0x5C));

    // step8: Start external polling 5A
    buf = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,]);
    await joycon.sendSubcmdAsync(0x5A, [0x04, ...buf]);
    //await joycon.sendOutputReportAsync(0x01, [...rumble, 0x5A, 0x04, ...buf]);
    await sleep(300);
    console.log(joycon.getLatestReport(0x5A));

    joycon.on('standard', (data) => {
        console.log(data.data);
        return;
        const data1 = data[7];
        const data2 = data[8];
        const index = data[7] + (data[8] << 8);
        const brokenRoulette = data[38];
        let number;

        for (let i = 0; i < 10; i++) {
            if ((index >> i) === 1) {
                number = i + 1;
            }
        }

        console.log({number, brokenRoulette});
    });

    //process.exit(0);

    // 
    //joycon.sendOutputReportAsync(0x01, [...rumble, 0x59]);
    //await sleep(30);
}