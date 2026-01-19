# muse-js

[![CI](https://github.com/urish/muse-js/actions/workflows/ci.yml/badge.svg)](https://github.com/urish/muse-js/actions/workflows/ci.yml)

Modern JavaScript library for Muse EEG headsets using the Web Bluetooth API.

## Supported Devices

- ✅ **Muse 1** (2016)
- ✅ **Muse 2**
- ✅ **Muse S** (Classic)
- 🚧 **Muse 3 / S Athena** - Basic support implemented, full support in progress (see [MUSE3_STATUS.md](./MUSE3_STATUS.md))

## Features

- 🧠 Real-time EEG data streaming
- 📊 PPG (Photoplethysmography) sensor support
- 📐 Accelerometer and gyroscope data
- 🔋 Battery and telemetry information
- 🎯 Event markers for experiments
- 📦 Dual ESM/CommonJS builds
- 💪 Written in TypeScript
- 🌐 Works in modern browsers via Web Bluetooth API
- 📱 Node.js support

## Installation

```bash
npm install muse-js
```

## Running the Demo App

The demo application showcases real-time EEG visualization:

```bash
# Install dependencies
npm install
npm run demo:install

# Start the demo server
npm start
```

Then open http://localhost:4445/ in your browser.

## Usage example

```javascript

import { MuseClient } from 'muse-js';

async function main() {
  let client = new MuseClient();
  await client.connect();
  await client.start();
  client.eegReadings.subscribe(reading => {
    console.log(reading);
  });
  client.telemetryData.subscribe(telemetry => {
    console.log(telemetry);
  });
  client.accelerometerData.subscribe(acceleration => {
    console.log(acceleration);
  });
}

main();
```

## What's New in v4.0

🎉 **Major modernization update!**

- ⚡ Modern build system with dual ESM/CommonJS output via [tsup](https://tsup.egoist.dev/)
- 📦 TypeScript 5.x with modern ES2020 target
- ✅ Updated to latest dependencies (RxJS 7, Jest 29, ESLint)
- 🔄 Replaced deprecated TSLint with ESLint
- 🎨 Demo now uses Vite instead of FuseBox (faster HMR, better DX)
- 🤖 GitHub Actions CI (replaced Travis CI)
- 🚀 Better Node.js 18+ compatibility
- 🧠 Muse 3 (S Athena) support implemented, full support in progress (see [MUSE3_STATUS.md](./MUSE3_STATUS.md))

## Using in Node.js

The library uses the Web Bluetooth API directly. For Node.js support, you can use packages that provide Web Bluetooth compatibility, such as [@abandonware/noble](https://github.com/abandonware/noble) with a Web Bluetooth wrapper, or use the [muse-lsl project](https://github.com/urish/muse-lsl) which provides a working Node.js implementation.

## Auxiliary Electrode

The Muse 2016 EEG headsets contains four electrodes, and you can connect an additional Auxiliary electrode through the Micro USB port. By default, muse-js does not read data from the Auxiliary electrode channel. You can change this behavior and enable the Auxiliary electrode by setting the `enableAux` property to `true`, just before calling the `connect` method:

```javascript
async function main() {
  let client = new MuseClient();
  client.enableAux = true;
  await client.connect();
}
```

## PPG (Photoplethysmography) / Optical Sensor

The Muse 2 and Muse S contain PPG/optical blood sensors, which this library supports. There are three signal streams, ppg1, ppg2, and ppg3. These are ambient, infrared, and red (respectively) on the Muse 2, and (we think, unconfirmed) infrared, green, and unknown (respectively) on the Muse S. To use PPG, ensure you enable it before connecting to a Muse. PPG is not present and thus will not work on Muse 1/1.5, and enabling it may have unexpected consequences.  

To enable PPG:

```javascript
async function main() {
  let client = new MuseClient();
  client.enablePpg = true;
  await client.connect();
}
```

To subscribe and receive values from PPG, it's just like subscribing to EEG (see **Usage Example**):

```javascript
client.ppgReadings.subscribe((ppgreading) => {
    console.log(ppgreading);
});
```

## Event Markers

For convenience, there is an `eventMarkers` stream included in `MuseClient` that you can use in order to introduce timestamped event markers into your project. Just subscribe to `eventMarkers` and use the `injectMarker` method with the value and optional timestamp of an event to send it through the stream.

```javascript
async function main() {
    let client = new MuseClient();
    client.eventMarkers.subscribe((event) => {
        console.log(event);
    });
    client.injectMarker("house")
    client.injectMarker("face")
    client.injectMarker("dog")
}
```

## Projects using muse-js

* [EEGEdu](https://eegedu.com/) - Interactive Brain Playground. [Source code](https://github.com/kylemath/EEGEdu) using React, Polaris and chartjs.
* [EEG Explorer](https://muse-eeg-app.web.app/) - Visual EEG readings from the Muse EEG Headset. [Source code](https://github.com/urish/eeg-explorer) using Angular, Material Design and smoothie charts.
