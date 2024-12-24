import {Joycon} from './lib/joycon.js';
import IR from './lib/reports.js';
import {createServer} from 'net';

const joycon = new Joycon();

const devices = joycon.findDevices();

console.log(devices);

if(devices.length === 0) {
    console.error("No device found");
    process.exit(1);
}

let deviceOpened = await joycon.openDevice(devices[0]);

// Keep the process alive using bogus server
createServer().listen();