/**
 * Muse 3 (S Athena) Packet Parser
 * Based on OpenMuse implementation
 *
 * Packet Structure:
 * - 14-byte header
 * - Data section containing subpackets
 * - Each subpacket has TAG byte identifying sensor type
 */

// Packet header constants
const PACKET_HEADER_SIZE = 14;
const SUBPACKET_HEADER_SIZE = 5; // TAG + 4 bytes

// TAG bytes (sensor type identifiers)
const TAG_EEG4 = 0x11;
const TAG_EEG8 = 0x12;
const TAG_OPTICS4 = 0x34;
const TAG_OPTICS8 = 0x35;
const TAG_OPTICS16 = 0x36;
const TAG_ACCGYRO = 0x47;
const TAG_BATTERY_NEW = 0x88;
const TAG_BATTERY_OLD = 0x98;

// Sensor configuration mapping
interface SensorConfig {
    type: string;
    nChannels: number;
    nSamples: number;
    rate: number;
    dataLen: number;
}

const SENSORS: Record<number, SensorConfig> = {
    [TAG_EEG4]: { type: 'EEG', nChannels: 4, nSamples: 4, rate: 256, dataLen: 28 },
    [TAG_EEG8]: { type: 'EEG', nChannels: 8, nSamples: 2, rate: 256, dataLen: 28 },
    [TAG_OPTICS4]: { type: 'OPTICS', nChannels: 4, nSamples: 3, rate: 64, dataLen: 30 },
    [TAG_OPTICS8]: { type: 'OPTICS', nChannels: 8, nSamples: 2, rate: 64, dataLen: 40 },
    [TAG_OPTICS16]: { type: 'OPTICS', nChannels: 16, nSamples: 1, rate: 64, dataLen: 40 },
    [TAG_ACCGYRO]: { type: 'ACCGYRO', nChannels: 6, nSamples: 3, rate: 52, dataLen: 36 },
    [TAG_BATTERY_NEW]: { type: 'BATTERY', nChannels: 1, nSamples: 1, rate: 0.2, dataLen: 188 },
    [TAG_BATTERY_OLD]: { type: 'BATTERY', nChannels: 1, nSamples: 1, rate: 1, dataLen: 20 },
};

// Scaling constants
const ACC_SCALE = 0.0000610352;
const GYRO_SCALE = -0.0074768;
const EEG_SCALE = 1450.0 / 16383.0;
const OPTICS_SCALE = 1.0 / 32768.0;

// Channel names
const _EEG_CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10', 'AUX_1', 'AUX_2', 'AUX_3', 'AUX_4'];

export interface Muse3Subpacket {
    sensorType: string;
    tagByte: number;
    data: number[][]; // [samples][channels]
    nChannels: number;
    nSamples: number;
}

export interface Muse3Packet {
    pktLen: number;
    pktIndex: number;
    pktId: number;
    pktType: string | null;
    subpackets: Muse3Subpacket[];
}

let debugMode = false;
const seenTagBytes = new Set<number>();

export function setMuse3DebugMode(enabled: boolean) {
    debugMode = enabled;
}

/**
 * Parse Muse 3 BLE packet
 */
export function parseMuse3Packet(data: DataView): Muse3Packet | null {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    // Need at least header
    if (bytes.length < PACKET_HEADER_SIZE) {
        return null;
    }

    // Parse 14-byte packet header
    const pktLen = bytes[0];
    const pktIndex = bytes[1];
    const pktId = bytes[9];

    // Get packet type from configuration
    const config = SENSORS[pktId];
    const pktType = config ? config.type : null;

    if (debugMode && pktType) {
        console.log(`Packet: len=${pktLen}, idx=${pktIndex}, id=0x${pktId.toString(16)} (${pktType})`);
    }

    // Extract data section (everything after header)
    const pktData = bytes.subarray(PACKET_HEADER_SIZE);

    // Parse subpackets from data section
    const subpackets = parseDataSubpackets(pktData, pktId, pktType);

    return {
        pktLen,
        pktIndex,
        pktId,
        pktType,
        subpackets,
    };
}

/**
 * Parse subpackets from packet data section
 */
function parseDataSubpackets(pktData: Uint8Array, pktId: number, pktType: string | null): Muse3Subpacket[] {
    const subpackets: Muse3Subpacket[] = [];
    let offset = 0;

    // Step 1: Parse first subpacket (no TAG, no header - matches pktId)
    if (pktType && SENSORS[pktId]) {
        const config = SENSORS[pktId];
        const dataLen = config.dataLen;

        if (offset + dataLen <= pktData.length) {
            const dataBytes = pktData.subarray(offset, offset + dataLen);
            const decoded = decodeSubpacketData(pktId, dataBytes);

            if (decoded) {
                subpackets.push(decoded);
                if (debugMode) {
                    console.log(`  First subpacket: ${pktType} (${config.nChannels}ch x ${config.nSamples} samples)`);
                }
            }

            offset += dataLen;
        }
    }

    // Step 2: Parse additional subpackets (each with TAG + 4-byte header + data)
    while (offset < pktData.length) {
        // Need at least TAG + header
        if (offset + SUBPACKET_HEADER_SIZE > pktData.length) {
            break;
        }

        const tagByte = pktData[offset];

        // Validate TAG
        if (!SENSORS[tagByte]) {
            break;
        }

        const config = SENSORS[tagByte];
        const dataLen = config.dataLen;

        // Check if we have enough bytes
        if (offset + SUBPACKET_HEADER_SIZE + dataLen > pktData.length) {
            break;
        }

        // Extract data
        const dataBytes = pktData.subarray(offset + SUBPACKET_HEADER_SIZE, offset + SUBPACKET_HEADER_SIZE + dataLen);
        const decoded = decodeSubpacketData(tagByte, dataBytes);

        if (decoded) {
            subpackets.push(decoded);
            if (debugMode && !seenTagBytes.has(tagByte)) {
                console.log(`  Additional subpacket: TAG=0x${tagByte.toString(16)} (${config.type})`);
                seenTagBytes.add(tagByte);
            }
        }

        offset += SUBPACKET_HEADER_SIZE + dataLen;
    }

    return subpackets;
}

/**
 * Decode subpacket data based on TAG byte
 */
function decodeSubpacketData(tagByte: number, dataBytes: Uint8Array): Muse3Subpacket | null {
    const config = SENSORS[tagByte];
    if (!config) {
        return null;
    }

    const { type, nChannels, nSamples } = config;

    let data: number[][] | null = null;

    switch (type) {
        case 'EEG':
            data = decodeEEGData(dataBytes, nChannels, nSamples);
            break;
        case 'ACCGYRO':
            data = decodeACCGYROData(dataBytes);
            break;
        case 'OPTICS':
            data = decodeOpticsData(dataBytes, nChannels, nSamples);
            break;
        case 'BATTERY':
            data = decodeBatteryData(dataBytes);
            break;
    }

    if (!data) {
        return null;
    }

    return {
        sensorType: type,
        tagByte,
        data,
        nChannels,
        nSamples,
    };
}

/**
 * Decode EEG data (14-bit packed values)
 */
function decodeEEGData(dataBytes: Uint8Array, nChannels: number, nSamples: number): number[][] | null {
    if (dataBytes.length < 28) {
        return null;
    }

    // Convert bytes to bits (LSB first)
    const bits = bytesToBits(dataBytes, 28);

    // Parse 14-bit values
    const data: number[][] = [];

    for (let sampleIdx = 0; sampleIdx < nSamples; sampleIdx++) {
        const sampleData: number[] = [];
        for (let channelIdx = 0; channelIdx < nChannels; channelIdx++) {
            const bitStart = (sampleIdx * nChannels + channelIdx) * 14;
            const intValue = extractPackedInt(bits, bitStart, 14);
            sampleData.push(intValue * EEG_SCALE);
        }
        data.push(sampleData);
    }

    return data;
}

/**
 * Decode ACCGYRO data (3 samples x 6 channels)
 */
function decodeACCGYROData(dataBytes: Uint8Array): number[][] | null {
    if (dataBytes.length < 36) {
        return null;
    }

    const data: number[][] = [];
    const view = new DataView(dataBytes.buffer, dataBytes.byteOffset, 36);

    for (let i = 0; i < 3; i++) {
        const offset = i * 12;
        const sample = [
            view.getInt16(offset, true) * ACC_SCALE, // ACC_X
            view.getInt16(offset + 2, true) * ACC_SCALE, // ACC_Y
            view.getInt16(offset + 4, true) * ACC_SCALE, // ACC_Z
            view.getInt16(offset + 6, true) * GYRO_SCALE, // GYRO_X
            view.getInt16(offset + 8, true) * GYRO_SCALE, // GYRO_Y
            view.getInt16(offset + 10, true) * GYRO_SCALE, // GYRO_Z
        ];
        data.push(sample);
    }

    return data;
}

/**
 * Decode Optics data (20-bit packed values)
 */
function decodeOpticsData(dataBytes: Uint8Array, nChannels: number, nSamples: number): number[][] | null {
    const bytesNeeded = nChannels === 4 ? 30 : 40;

    if (dataBytes.length < bytesNeeded) {
        return null;
    }

    // Convert bytes to bits
    const bits = bytesToBits(dataBytes, bytesNeeded);

    // Parse 20-bit values
    const data: number[][] = [];

    for (let sampleIdx = 0; sampleIdx < nSamples; sampleIdx++) {
        const sampleData: number[] = [];
        for (let channelIdx = 0; channelIdx < nChannels; channelIdx++) {
            const bitStart = (sampleIdx * nChannels + channelIdx) * 20;
            const intValue = extractPackedInt(bits, bitStart, 20);
            sampleData.push(intValue * OPTICS_SCALE);
        }
        data.push(sampleData);
    }

    return data;
}

/**
 * Decode Battery data (first 2 bytes)
 */
function decodeBatteryData(dataBytes: Uint8Array): number[][] | null {
    if (dataBytes.length < 2) {
        return null;
    }

    const rawSoc = (dataBytes[0] | (dataBytes[1] << 8)) >>> 0; // Little-endian uint16
    const batteryPercent = rawSoc / 256.0;

    return [[batteryPercent]];
}

/**
 * Convert bytes to bit array (LSB first)
 */
function bytesToBits(dataBytes: Uint8Array, nBytes: number): number[] {
    const bits: number[] = [];
    for (let i = 0; i < nBytes && i < dataBytes.length; i++) {
        const byte = dataBytes[i];
        for (let bitPos = 0; bitPos < 8; bitPos++) {
            bits.push((byte >> bitPos) & 1);
        }
    }
    return bits;
}

/**
 * Extract packed integer from bit array
 */
function extractPackedInt(bits: number[], bitStart: number, bitWidth: number): number {
    let intValue = 0;
    for (let bitIdx = 0; bitIdx < bitWidth; bitIdx++) {
        if (bits[bitStart + bitIdx]) {
            intValue |= 1 << bitIdx;
        }
    }
    return intValue;
}
