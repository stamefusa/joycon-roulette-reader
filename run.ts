import {Joycon, StandardReport, StandardFullReport} from './lib/joycon.js';
import crc8 from 'crc/crc8';
import SC from './lib/subcommand.js';

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

const joycon = new Joycon();

const devices = joycon.findDevices();

console.log(devices);

if(devices.length === 0) {
    console.error("No devices found");
    process.exit(1);
}

joycon.openDevice(devices[0]);

let buf : Buffer;

if(false) {
    // reset to default state
    const rumble = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];
    await joycon.sendOutputReportAsync(0x01, [...rumble, 0x03, 0x3F]);
} else {

    // Initialize JoyCon R

    // Set shipment state
    await joycon.sendSubcommandRawAsync(0x08, [0x00]);
    await sleep(150);
    console.log(joycon.getLatestReportForId(0x08));

    // Set input mode: standard full @60Hz
    await joycon.sendSubcommandAsync(new SC.SetInputReportModeRequest(SC.InputReportMode.STANDARD_FULL));
    await sleep(150);
    console.log(joycon.getLatestReportForId(0x03));


    // Set trigger button elapsed time
    await joycon.sendSubcommandAsync(new SC.TriggerButtonElapsedTimeRequest(0));
    await sleep(150);
    console.log(joycon.getLatestReportForId(0x04));

    // Enable IMU
    await joycon.sendSubcommandAsync(new SC.EnableIMU6AxisSensorRequest(2));
    await sleep(150);
    console.log(joycon.getLatestReportForId(0x40));

    // Enable vibration
    await joycon.sendSubcommandAsync(new SC.EnableVibrationRequest(true));
    await sleep(150);
    console.log(joycon.getLatestReportForId(0x48));

    // step1: Resume MCU / Set MCU state
    await joycon.sendSubcommandAsync(new SC.SetMCUStateRequest(SC.MCUState.RESUME));
    await sleep(150);
    console.log(joycon.getLatestReportForId(0x22));

    // Set LED
    await joycon.sendSubcommandAsync(new SC.SetPlayerLightsRequest(SC.LightPosition.ONE));
    await sleep(150);
    console.log(joycon.getLatestReportForId(0x30));

    // MCU data 21 21 0 0 
    buf = Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00]);
    //await joycon.sendSubcommandAsync(new SC.ConfigureMCURequest(0x21, buf));
    await joycon.sendSubcommandAsync(new SC.ConfigureMCURequest(0x21, 0, 0));
    await sleep(300);
    console.log(joycon.getLatestReportForId(0x21));

    await joycon.sendSubcommandAsync(new SC.SetMCUStateRequest(SC.MCUState.SUSPEND));
    await sleep(300);
    console.log(joycon.getLatestReportForId(0x22));

    await sleep(1000);


    console.log("========== Initializing Roulette ==========");

    await joycon.sendSubcommandAsync(new SC.SetMCUStateRequest(SC.MCUState.RESUME));
    await sleep(300);
    console.log(joycon.getLatestReportForId(0x22));

    // step3: (while) Enable MCU polling? (Enable MCU ext device?)
    // send a2 1 8 0 0 0 0 0 0 0 0 21 21 0 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 fa
    // returns  
    //  ready: (a0) 21 1 32 0 0 8 0 1b 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 80
    //  not ready: (a0) 21 1 0 0 0 8 0 1b 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 48
    buf = Buffer.from([
        0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00]);
    while(true) {
        //await joycon.sendSubcommandAsync(new SC.ConfigureMCURequest(0x21, buf));
        await joycon.sendSubcommandAsync(new SC.ConfigureMCURequest(0x21, 0, 3));
        await sleep(300);
        const latestReport21 = joycon.getLatestReportForId(0x21);
        if (!latestReport21) continue;
        console.log(latestReport21.reply);
        if(latestReport21.reply[0] == 0x01 && latestReport21.reply[1] == 0x32) {
            console.log("MCU ready");
            break;
        }

    }

    // 21 21 1 1
    // send: 01 0e 00 01 40 40 00 01 40 40 21 21 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 f3
    buf = Buffer.from([
        0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00]);
    //await joycon.sendSubcommandAsync(new SC.ConfigureMCURequest(0x21, buf));
    await joycon.sendSubcommandAsync(new SC.ConfigureMCURequest(0x21, 1, 1));
    await sleep(300);
    console.log(joycon.getLatestReportForId(0x21));

    // ext data (external device info)
    await joycon.sendSubcommandAsync(new SC.GetMCUExternalDevice_59());
    await sleep(300);
    const latestReport59 = joycon.getLatestReportForId(0x59);
    if(latestReport59.reply[1] !== 0x29 || latestReport59.reply[0] !== 0x00) {
        //ルーレット attached if sub response[1] == 29 or ((uint16*)&subresponse[0]) == 0x0001
        console.log("Roulette not attached");
        process.exit(1);
    }
 

    // step7: enable IMU
    await joycon.sendSubcommandAsync(new SC.EnableIMU6AxisSensorRequest(3));
    await sleep(200);
    console.log(joycon.getLatestReportForId(0x40)); 

    // Get ext device info
    //buf = Buffer.from([0x06, 0x03, 0x25, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    //    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    //    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    await joycon.sendSubcommandAsync(new SC.UnknownMCU_5C(new Uint8Array([0x06, 0x03, 0x25, 0x06])));
    await sleep(300);
    console.log(joycon.getLatestReportForId(0x5C));

    // step8: Start external polling 5A
    //buf = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,]);
    await joycon.sendSubcommandAsync(new SC.UnknownMCU_5A(new Uint8Array([0x01, 0x02, 0x03, 0x04])));
    await sleep(300);
    console.log(joycon.getLatestReportForId(0x5A));

    joycon.on('standardFull', (data: StandardFullReport) => {
        const index = data.leftAnalog[1] + (data.leftAnalog[2] << 8);
        const brokenRoulette = ((data.sixAxisData[2].xAxis >> 8) & 0x01) === 1;

        const data1 = data.leftAnalog[1];
        const data2 = data.leftAnalog[2];
        let number;

        for (let i = 0; i < 10; i++) {
            if ((index >> i) === 1) {
                number = i + 1;
            }
        }

        console.log({number, brokenRoulette});
    });
}