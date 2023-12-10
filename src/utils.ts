import {TelnetCode} from "./codes.ts";


export function scanUntilIAC(data: Uint8Array): number {
    for (let i = 0; i < data.length; i++) {
        if (data[i] === TelnetCode.IAC) { // 255 is the IAC byte
            return i;
        }
    }
    return data.length; // Return the length if IAC is not found
}

export function scanUntilIACSE(data: Uint8Array): number {
    let i = 0;
    while (i < data.length - 1) { // -1 because we need at least 2 bytes for IAC SE
        if (data[i] === TelnetCode.IAC) {
            if (data[i + 1] === TelnetCode.SE) {
                // Found unescaped IAC SE
                return i + 2; // Return the length including IAC SE
            } else if (data[i + 1] === TelnetCode.IAC) {
                // Escaped IAC, skip this and the next byte
                i += 2;
                continue;
            }
            // Else it's an IAC followed by something other than SE or another IAC,
            // which is unexpected in subnegotiation. You might want to handle this as an error or special case.
        }
        i++;
    }
    return -1; // Return -1 to indicate that IAC SE was not found
}

export function appendBytes(original: Uint8Array, newBytes: Uint8Array): Uint8Array {
    const combined = new Uint8Array(original.length + newBytes.length);
    combined.set(original);
    combined.set(newBytes, original.length);
    return combined;
}

export function convertBufferToString(buffer: Uint8Array): string {
    const decoder = new TextDecoder(); // Default is 'utf-8'
    return decoder.decode(buffer);
}

export function scanForLineEndings(data: Uint8Array): number {
    let lineEndIndex = -1;
    for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === TelnetCode.CR && data[i + 1] === TelnetCode.LF) { // \r\n
            lineEndIndex = i;
            break;
        }
    }
    return lineEndIndex;
}

export class Awaitable {
    private resolve: Function | null = null;
    private reject: Function | null = null;
    private promise: Promise<any>;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    trigger(data?: any) {
        if (this.resolve) {
            this.resolve(data);
        }
    }

    fail(error?: any) {
        if (this.reject) {
            this.reject(error);
        }
    }

    getPromise(): Promise<any> {
        return this.promise;
    }
}


export function generateRandomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export function generateTelnetName(tls: boolean): string {
    return `${tls ? "telnets" : "telnet"}-${generateRandomString(10)}`;
}