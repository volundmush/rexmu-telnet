import {TelnetCode} from "./codes.ts";
import {scanUntilIAC, scanUntilIACSE} from "./utils.ts";

export enum TelnetMessageType {
    DATA = 0,
    COMMAND = 1,
    NEGOTIATION = 2,
    SUBNEGOTIATION = 3
}



export class TelnetMessage {
    private readonly type: TelnetMessageType;
    private readonly data: Uint8Array;

    constructor(type: TelnetMessageType, data: Uint8Array) {
        this.type = type;
        this.data = data;
    }

    public getType(): TelnetMessageType {
        return this.type;
    }

    public getData(): Uint8Array {
        return this.data;
    }

    public getOption(): number | undefined {
        switch(this.type) {
            case TelnetMessageType.NEGOTIATION:
                return this.data[2];
            case TelnetMessageType.SUBNEGOTIATION:
                return this.data[3];
            default:
                return undefined;
        }
    }

    public getCommand(): number | undefined {
        switch(this.type) {
            case TelnetMessageType.COMMAND:
            case TelnetMessageType.NEGOTIATION:
                return this.data[1];
            default:
                return undefined;
        }
    }

    public getSub(): Uint8Array | undefined {
        switch(this.type) {
            case TelnetMessageType.SUBNEGOTIATION:
                return this.data.slice(4, this.data.length - 2);
            default:
                return undefined;
        }
    }

    public static fromNegotiate(code: number, option: number): TelnetMessage {
        return new TelnetMessage(TelnetMessageType.NEGOTIATION, new Uint8Array([TelnetCode.IAC, code, option]));
    }

    public static fromSubNegotiate(option: number, data: Uint8Array): TelnetMessage {
        const combined = new Uint8Array(5 + data.length);
        combined.set([TelnetCode.IAC, TelnetCode.SB, option]);
        combined.set(data, 3);
        combined.set([TelnetCode.IAC, TelnetCode.SE], 3 + data.length);
        return new TelnetMessage(TelnetMessageType.SUBNEGOTIATION, combined);
    }

    public static fromCommand(command: number): TelnetMessage {
        return new TelnetMessage(TelnetMessageType.COMMAND, new Uint8Array([TelnetCode.IAC, command]));
    }

    public static fromData(data: Uint8Array): TelnetMessage {
        return new TelnetMessage(TelnetMessageType.DATA, data);
    }

    public static fromBytes(data: Uint8Array): { message?: TelnetMessage, bytesRead: number } {

        if (data.length < 1) {
            return { bytesRead: 0 };
        }

        if (data[0] == TelnetCode.IAC) {
            // The first byte is an IAC.
            if (data.length < 2) {
                // We don't have enough data to read the command.
                return { bytesRead: 0 };
            }

            // The second byte is the command.
            // If it's WILL/WONT/DO/DONT then we need 3 bytes total.
            // If it's an IAC then these are an escaped IAC and we'll return a single IAC as data.
            // If it's an SB then we need to scan ahead for the unescaped IAC SE. A minimum of 5 bytes total.
            // Anything else following an IAC is a Command message.

            switch (data[1]) {
                case TelnetCode.IAC:
                    // Escaped IAC. Return a single IAC as data.
                    return { message: new TelnetMessage(TelnetMessageType.DATA, data.slice(0,1)), bytesRead: 2 };
                case TelnetCode.WILL:
                case TelnetCode.WONT:
                case TelnetCode.DO:
                case TelnetCode.DONT:
                    if (data.length < 3) {
                        return { bytesRead: 0 };
                    }
                    return { message: new TelnetMessage(TelnetMessageType.NEGOTIATION, data.slice(0, 3)), bytesRead: 3 };
                case TelnetCode.SB:
                    // Scan ahead for unescaped IAC SE
                {
                    const length = scanUntilIACSE(data);
                    if (length < 5) {
                        return { bytesRead: 0 };
                    }
                    return { message: new TelnetMessage(TelnetMessageType.SUBNEGOTIATION, data.slice(0, length)), bytesRead: length };
                }
                default:
                    // Anything else following an IAC is a Command message
                    return { message: new TelnetMessage(TelnetMessageType.COMMAND, data.slice(0, 2)), bytesRead: 2 };
            }
        }

        // We can only reach this if the first byte isn't an IAC.
        // In this case, we scan ahead until the first IAC or End-of-Data and return the data
        // as DATA type TelnetMessage. Be careful NOT to include a 'terminating' IAC in the data.

        let length = scanUntilIAC(data);
        let newData = data.slice(0, length);
        return { message: new TelnetMessage(TelnetMessageType.DATA, newData), bytesRead: length };

    }
}