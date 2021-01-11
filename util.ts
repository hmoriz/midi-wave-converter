export namespace Util {

    export function getFrequencyFromNoteID(noteID : number) {
        const table = [
            440,
            466.16376152,
            493.88330126,
            523.2511306,
            554.36526195,
            587.32953583,
            622.25396744,
            659.25511383,
            698.45646287,
            739.98884542,
            783.99087196,
            830.60939516,
        ];
        const offset = (noteID + 3) % 12;
        const size = 2 ** Math.floor((noteID -69) / 12);
        return table[offset] * size;
    }

    export function getLittleEndianNumberFromUint8Array(data : Uint8Array, offset : number, size : number) : number {
        let ret = 0;
        for (let i = 0; i < size; i++) {
            ret += data[offset + i] << (i * 8);
        }
        return ret;
    }
    
    export function setLittleEndianNumberToUint8Array(data : Uint8Array, offset, size, value) {
        for (let i = 0; i < size; i++) {
            data.set([(value >> (i * 8)) & 0xff], offset+i);
        }
    }

    export function getBigEndianNumberFromUint8Array(data : Uint8Array, offset : number, size : number) {
        let ret = 0;
        for (let i = 0; i < size; i++) {
            ret = (ret << 8) + data[offset + i];
        }
        return ret;
    }
}