import { parseMuse3Packet, setMuse3DebugMode } from './muse3-parse';

// Helper to create a DataView from a Uint8Array
function createDataView(bytes: number[]): DataView {
    const arr = new Uint8Array(bytes);
    return new DataView(arr.buffer);
}

// Helper to create a minimal valid packet header (14 bytes)
function createPacketHeader(pktLen: number, pktIndex: number, pktId: number): number[] {
    // Header structure: [len, index, ...padding..., pktId at byte 9, ...rest]
    const header = new Array(14).fill(0);
    header[0] = pktLen;
    header[1] = pktIndex;
    header[9] = pktId; // Packet type identifier
    return header;
}

describe('Muse 3 Parser', () => {
    beforeEach(() => {
        // Reset debug mode before each test
        setMuse3DebugMode(false);
    });

    describe('parseMuse3Packet', () => {
        it('should return null for empty data', () => {
            const data = createDataView([]);
            const result = parseMuse3Packet(data);
            expect(result).toBeNull();
        });

        it('should return null for packets smaller than header size (14 bytes)', () => {
            const data = createDataView([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
            const result = parseMuse3Packet(data);
            expect(result).toBeNull();
        });

        it('should parse packet header correctly', () => {
            // Create a minimal packet with just a header (unknown type)
            const header = createPacketHeader(14, 42, 0xff); // Unknown packet type
            const data = createDataView(header);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.pktLen).toBe(14);
            expect(result!.pktIndex).toBe(42);
            expect(result!.pktId).toBe(0xff);
            expect(result!.pktType).toBeNull(); // Unknown type
            expect(result!.subpackets).toEqual([]);
        });

        it('should identify EEG8 packet type (0x12)', () => {
            const TAG_EEG8 = 0x12;
            const header = createPacketHeader(42, 1, TAG_EEG8);
            // Add 28 bytes of EEG data (minimum for EEG8)
            const eegData = new Array(28).fill(0);
            const data = createDataView([...header, ...eegData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.pktType).toBe('EEG');
            expect(result!.subpackets.length).toBeGreaterThanOrEqual(1);
        });

        it('should identify EEG4 packet type (0x11)', () => {
            const TAG_EEG4 = 0x11;
            const header = createPacketHeader(42, 1, TAG_EEG4);
            const eegData = new Array(28).fill(0);
            const data = createDataView([...header, ...eegData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.pktType).toBe('EEG');
        });

        it('should identify ACCGYRO packet type (0x47)', () => {
            const TAG_ACCGYRO = 0x47;
            const header = createPacketHeader(50, 5, TAG_ACCGYRO);
            // Add 36 bytes of ACCGYRO data
            const imuData = new Array(36).fill(0);
            const data = createDataView([...header, ...imuData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.pktType).toBe('ACCGYRO');
            expect(result!.subpackets.length).toBeGreaterThanOrEqual(1);
        });

        it('should identify OPTICS packet types', () => {
            const TAG_OPTICS16 = 0x36;
            const header = createPacketHeader(54, 3, TAG_OPTICS16);
            // Add 40 bytes of optics data
            const opticsData = new Array(40).fill(0);
            const data = createDataView([...header, ...opticsData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.pktType).toBe('OPTICS');
        });

        it('should identify BATTERY packet type (0x88)', () => {
            const TAG_BATTERY_NEW = 0x88;
            const header = createPacketHeader(202, 10, TAG_BATTERY_NEW);
            // Add 188 bytes of battery data
            const batteryData = new Array(188).fill(0);
            // Set some battery level (little-endian uint16)
            batteryData[0] = 0x00; // Low byte
            batteryData[1] = 0x64; // High byte = 100 * 256 = 25600
            const data = createDataView([...header, ...batteryData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.pktType).toBe('BATTERY');
        });
    });

    describe('EEG data decoding', () => {
        it('should decode EEG8 packet with correct number of channels and samples', () => {
            const TAG_EEG8 = 0x12;
            const header = createPacketHeader(42, 1, TAG_EEG8);
            // Create 28 bytes of EEG data with non-zero values
            const eegData = new Array(28).fill(0x55); // Pattern that creates non-zero samples
            const data = createDataView([...header, ...eegData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.subpackets.length).toBe(1);

            const eegSubpacket = result!.subpackets[0];
            expect(eegSubpacket.sensorType).toBe('EEG');
            expect(eegSubpacket.nChannels).toBe(8);
            expect(eegSubpacket.nSamples).toBe(2);
            expect(eegSubpacket.data.length).toBe(2); // 2 samples
            expect(eegSubpacket.data[0].length).toBe(8); // 8 channels per sample
        });

        it('should decode EEG4 packet with correct number of channels and samples', () => {
            const TAG_EEG4 = 0x11;
            const header = createPacketHeader(42, 1, TAG_EEG4);
            const eegData = new Array(28).fill(0x55);
            const data = createDataView([...header, ...eegData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            const eegSubpacket = result!.subpackets[0];
            expect(eegSubpacket.nChannels).toBe(4);
            expect(eegSubpacket.nSamples).toBe(4);
            expect(eegSubpacket.data.length).toBe(4); // 4 samples
            expect(eegSubpacket.data[0].length).toBe(4); // 4 channels per sample
        });

        it('should apply EEG scaling factor to decoded values', () => {
            const TAG_EEG8 = 0x12;
            const header = createPacketHeader(42, 1, TAG_EEG8);
            // Create EEG data with known values
            const eegData = new Array(28).fill(0);
            const data = createDataView([...header, ...eegData]);

            const result = parseMuse3Packet(data);
            const eegSubpacket = result!.subpackets[0];

            // All zeros should produce scaled zero values
            expect(eegSubpacket.data[0][0]).toBe(0);
        });
    });

    describe('ACCGYRO data decoding', () => {
        it('should decode ACCGYRO packet with 3 samples and 6 channels', () => {
            const TAG_ACCGYRO = 0x47;
            const header = createPacketHeader(50, 5, TAG_ACCGYRO);
            // Create 36 bytes of IMU data (3 samples × 6 channels × 2 bytes)
            const imuData = new Array(36).fill(0);
            const data = createDataView([...header, ...imuData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.subpackets.length).toBe(1);

            const imuSubpacket = result!.subpackets[0];
            expect(imuSubpacket.sensorType).toBe('ACCGYRO');
            expect(imuSubpacket.nChannels).toBe(6);
            expect(imuSubpacket.nSamples).toBe(3);
            expect(imuSubpacket.data.length).toBe(3); // 3 samples
            expect(imuSubpacket.data[0].length).toBe(6); // 6 channels (ax,ay,az,gx,gy,gz)
        });

        it('should correctly decode accelerometer values with scaling', () => {
            const TAG_ACCGYRO = 0x47;
            const header = createPacketHeader(50, 5, TAG_ACCGYRO);

            // Create IMU data with known int16 values (little-endian)
            // Value 16384 (0x4000) with ACC_SCALE (0.0000610352) ≈ 1.0 g
            const imuData = new Array(36).fill(0);
            // Set first sample ACC_X to 16384 (little-endian: 0x00, 0x40)
            imuData[0] = 0x00;
            imuData[1] = 0x40;

            const data = createDataView([...header, ...imuData]);
            const result = parseMuse3Packet(data);

            const imuSubpacket = result!.subpackets[0];
            // 16384 * 0.0000610352 ≈ 1.0
            expect(imuSubpacket.data[0][0]).toBeCloseTo(1.0, 2);
        });

        it('should correctly decode gyroscope values with negative scaling', () => {
            const TAG_ACCGYRO = 0x47;
            const header = createPacketHeader(50, 5, TAG_ACCGYRO);

            const imuData = new Array(36).fill(0);
            // Set first sample GYRO_X (offset 6,7) to 1000 (little-endian)
            imuData[6] = 0xe8; // 1000 low byte
            imuData[7] = 0x03; // 1000 high byte

            const data = createDataView([...header, ...imuData]);
            const result = parseMuse3Packet(data);

            const imuSubpacket = result!.subpackets[0];
            // 1000 * -0.0074768 ≈ -7.4768
            expect(imuSubpacket.data[0][3]).toBeCloseTo(-7.4768, 2);
        });
    });

    describe('Battery data decoding', () => {
        it('should decode battery percentage correctly', () => {
            const TAG_BATTERY_NEW = 0x88;
            const header = createPacketHeader(202, 10, TAG_BATTERY_NEW);
            const batteryData = new Array(188).fill(0);
            // Set battery level to 50% (128 * 256 / 256 = 128... wait let me recalculate)
            // rawSoc / 256.0 = percentage, so for 50%, rawSoc = 50 * 256 = 12800
            // 12800 = 0x3200, little-endian: 0x00, 0x32
            batteryData[0] = 0x00;
            batteryData[1] = 0x32;

            const data = createDataView([...header, ...batteryData]);
            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            const batterySubpacket = result!.subpackets[0];
            expect(batterySubpacket.sensorType).toBe('BATTERY');
            expect(batterySubpacket.data[0][0]).toBeCloseTo(50, 0);
        });
    });

    describe('Optics data decoding', () => {
        it('should decode OPTICS16 packet correctly', () => {
            const TAG_OPTICS16 = 0x36;
            const header = createPacketHeader(54, 3, TAG_OPTICS16);
            const opticsData = new Array(40).fill(0);
            const data = createDataView([...header, ...opticsData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            const opticsSubpacket = result!.subpackets[0];
            expect(opticsSubpacket.sensorType).toBe('OPTICS');
            expect(opticsSubpacket.nChannels).toBe(16);
            expect(opticsSubpacket.nSamples).toBe(1);
        });

        it('should decode OPTICS4 packet correctly', () => {
            const TAG_OPTICS4 = 0x34;
            const header = createPacketHeader(44, 3, TAG_OPTICS4);
            const opticsData = new Array(30).fill(0);
            const data = createDataView([...header, ...opticsData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            const opticsSubpacket = result!.subpackets[0];
            expect(opticsSubpacket.nChannels).toBe(4);
            expect(opticsSubpacket.nSamples).toBe(3);
        });
    });

    describe('Multiple subpackets', () => {
        it('should parse additional subpackets with TAG headers', () => {
            const TAG_EEG8 = 0x12;
            const TAG_ACCGYRO = 0x47;

            const header = createPacketHeader(100, 1, TAG_EEG8);
            const eegData = new Array(28).fill(0x55);

            // Add a second subpacket (ACCGYRO) with TAG + 4-byte header + data
            const subpacketHeader = [TAG_ACCGYRO, 0, 0, 0, 0]; // TAG + 4 bytes
            const imuData = new Array(36).fill(0);

            const fullPacket = [...header, ...eegData, ...subpacketHeader, ...imuData];
            const data = createDataView(fullPacket);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            expect(result!.subpackets.length).toBe(2);
            expect(result!.subpackets[0].sensorType).toBe('EEG');
            expect(result!.subpackets[1].sensorType).toBe('ACCGYRO');
        });
    });

    describe('Edge cases', () => {
        it('should handle packets with insufficient data for subpacket', () => {
            const TAG_EEG8 = 0x12;
            const header = createPacketHeader(20, 1, TAG_EEG8);
            // Only add 10 bytes of data (less than required 28 for EEG8)
            const insufficientData = new Array(10).fill(0);
            const data = createDataView([...header, ...insufficientData]);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            // Should not crash, but may have empty subpackets
            expect(result!.pktType).toBe('EEG');
        });

        it('should stop parsing when encountering unknown TAG in additional subpackets', () => {
            const TAG_EEG8 = 0x12;
            const header = createPacketHeader(100, 1, TAG_EEG8);
            const eegData = new Array(28).fill(0x55);

            // Add invalid TAG byte followed by data
            const invalidSubpacket = [0xaa, 0, 0, 0, 0, ...new Array(36).fill(0)];

            const fullPacket = [...header, ...eegData, ...invalidSubpacket];
            const data = createDataView(fullPacket);

            const result = parseMuse3Packet(data);

            expect(result).not.toBeNull();
            // Should only have the first EEG subpacket
            expect(result!.subpackets.length).toBe(1);
        });
    });

    describe('Debug mode', () => {
        it('should toggle debug mode without errors', () => {
            expect(() => setMuse3DebugMode(true)).not.toThrow();
            expect(() => setMuse3DebugMode(false)).not.toThrow();
        });

        it('should parse packets in debug mode without errors', () => {
            setMuse3DebugMode(true);

            const TAG_EEG8 = 0x12;
            const header = createPacketHeader(42, 1, TAG_EEG8);
            const eegData = new Array(28).fill(0x55);
            const data = createDataView([...header, ...eegData]);

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            expect(() => parseMuse3Packet(data)).not.toThrow();

            consoleSpy.mockRestore();
            setMuse3DebugMode(false);
        });
    });
});
