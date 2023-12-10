import {TelnetCode} from "./codes.ts";
import {TelnetMessage, TelnetMessageType} from "./codec.ts";
import {TelnetIncomingTransformer, TelnetOutgoingTransformer } from "./transform.ts";
import {ServerManager, TelnetServer} from "./server.ts";
import {Awaitable, appendBytes, scanForLineEndings, convertBufferToString} from "./utils.ts";
import {log} from "../deps.ts";

enum Color {
    NoColor = 0,
    Standard = 1,
    Xterm256 = 2,
    TrueColor = 3
}

class Capabilities {
    public encryption = false;
    public clientName = "UNKNOWN";
    public clientVersion = "UNKNOWN";
    public hostAddress = "UNKNOWN";
    public hostNames: string[] = [];
    public encoding = "ascii";
    public color: Color = Color.NoColor;
    public width = 78;
    public height = 24;
    public mccp2 = false;
    public mccp2Enabled = false;
    public mccp3 = false;
    public mccp3Enabled = false;
    public gmcp = false;
    public msdp = false;
    public mssp = false;
    public mxp = false;
    public mtts = false;
    public naws = false;
    public sga = false;
    public linemode = false;
    public forceEndline = false;
    public screenReader = false;
    public mouseTracking = false;
    public vt100 = false;
    public oscColorPalette = false;
    public proxy = false;
    public mnes = false;
}

class TelnetOptionPerspective {
    public enabled = false;
    public negotiating = false;
}

class TelnetOptionState {
    public readonly local: TelnetOptionPerspective = new TelnetOptionPerspective();
    public readonly remote: TelnetOptionPerspective = new TelnetOptionPerspective();
}

abstract class TelnetOption {
    private readonly protocol: TelnetProtocol;
    public readonly state: TelnetOptionState = new TelnetOptionState();
    private localNegotiator?: Awaitable;
    private remoteNegotiator?: Awaitable;

    constructor(protocol: TelnetProtocol) {
        this.protocol = protocol;
    }

    public getNegotiators(): Awaitable[] {
        let out = [];
        if(this.localNegotiator) {
            out.push(this.localNegotiator);
        }
        if(this.remoteNegotiator) {
            out.push(this.remoteNegotiator);
        }
        return out;
    }

    public abstract getOptionCode(): number;
    public abstract getOptionName(): string;

    public allowLocal(): boolean {
        return false;
    }
    public allowRemote(): boolean {
        return false;
    }
    public startLocal(): boolean {
        return false;
    }
    public startRemote(): boolean {
        return false;
    }

    public onLocalEnable() {
        if(this.localNegotiator) {
            this.localNegotiator.trigger();
            this.localNegotiator = undefined;
        }
    }

    public onRemoteEnable() {
        if(this.remoteNegotiator) {
            this.remoteNegotiator.trigger();
            this.remoteNegotiator = undefined;
        }
    }

    public onLocalDisable() {

    }

    public onRemoteDisable() {

    }

    public onNegotiate(code: TelnetCode) {
        let enableMethod: Function | undefined;
        let disableMethod: Function | undefined;
        let allowMethod: Function | undefined;
        let enableCode: TelnetCode;
        let disableCode: TelnetCode;
        let state: TelnetOptionPerspective;
        let negotiator: Awaitable | undefined;
        let enabling = false;

        switch(code) {
            case TelnetCode.DO:
                enableMethod = this.onLocalEnable;
                disableMethod = this.onLocalDisable;
                enableCode = TelnetCode.WILL;
                disableCode = TelnetCode.WONT;
                state = this.state.local;
                enabling = true;
                allowMethod = this.allowLocal;
                negotiator = this.localNegotiator;
                break;
            case TelnetCode.DONT:
                enableMethod = this.onRemoteEnable;
                disableMethod = this.onRemoteDisable;
                allowMethod = this.allowRemote;
                enableCode = TelnetCode.WILL;
                disableCode = TelnetCode.DONT;
                state = this.state.remote;
                negotiator = this.remoteNegotiator;
                break;
            case TelnetCode.WILL:
                enableMethod = this.onRemoteEnable;
                disableMethod = this.onRemoteDisable;
                allowMethod = this.allowRemote;
                enableCode = TelnetCode.DO;
                disableCode = TelnetCode.DONT;
                state = this.state.remote;
                negotiator = this.remoteNegotiator;
                enabling = true;
                break;
            case TelnetCode.WONT:
                enableMethod = this.onLocalEnable;
                disableMethod = this.onLocalDisable;
                allowMethod = this.allowLocal;
                enableCode = TelnetCode.WILL;
                disableCode = TelnetCode.WONT;
                state = this.state.local;
                negotiator = this.localNegotiator;
                break;
            default:
                return;
        }

        if(state.negotiating) {
            if(enabling) {
                state.negotiating = false;
                state.enabled = true;
                enableMethod();
            } else {
                state.negotiating = false;
                if(state.enabled) {
                    state.enabled = false;
                    disableMethod();
                } else {
                    if(negotiator) {
                        negotiator.trigger();
                        negotiator = undefined;
                    }
                }
            }
        } else {
            if(enabling) {
                if(allowMethod()) {
                    enableMethod();
                    this.sendNegotiate(enableCode);
                } else {
                    this.sendNegotiate(disableCode);
                }
            } else {
                if(state.enabled) {
                    state.enabled = false;
                    disableMethod();
                    this.sendNegotiate(disableCode);
                }
            }
        }
    }

    public onSubNegotiate(data: Uint8Array) {

    }

    public sendSubNegotiate(data: Uint8Array) {
        this.protocol.send(TelnetMessage.fromSubNegotiate(this.getOptionCode(), data));
    }

    public sendNegotiate(code: TelnetCode) {
        this.protocol.send(TelnetMessage.fromNegotiate(code, this.getOptionCode()));
    }

    public startNegotiation() {
        if(this.startLocal()) {
            this.sendNegotiate(TelnetCode.DO);
            this.state.local.negotiating = true;
            this.localNegotiator = new Awaitable();
        }
        if(this.startRemote()) {
            this.sendNegotiate(TelnetCode.WILL);
            this.state.remote.negotiating = true;
            this.remoteNegotiator = new Awaitable();
        }
    }

}


class SGAOption extends TelnetOption {
    public getOptionCode(): number {
        return TelnetCode.SGA;
    }

    public getOptionName(): string {
        return "Suppress Go Ahead";
    }

    public allowLocal(): boolean {
        return true;
    }

    public startLocal(): boolean {
        return true;
    }

}

class NAWSOption extends TelnetOption {
    public getOptionCode(): number {
        return TelnetCode.NAWS;
    }

    public getOptionName(): string {
        return "Negotiate About Window Size";
    }

    public allowRemote(): boolean {
        return true;
    }

    public startRemote(): boolean {
        return true;
    }

    public onSubNegotiate(data: Uint8Array) {
        if(data.length >= 4) {
            const width = (data[0] << 8) | data[1];
            const height = (data[2] << 8) | data[3];
            log.info(`Window size is ${width}x${height}`);
        }
    }
}

const OPTIONS = [SGAOption, NAWSOption];

export class TelnetProtocol {
    private readonly conn: Deno.Conn;
    private sendController?: ReadableStreamDefaultController<TelnetMessage>;
    private readonly incomingStream: ReadableStream<TelnetMessage>;
    private readonly writerStream: WritableStream<Uint8Array>;
    private readonly outgoingStream: ReadableStream<TelnetMessage>;
    private readonly toGameStream?: ReadableStream<string>;
    private toGameStreamController?: ReadableStreamDefaultController<string>;
    private readonly fromGameStream?: ReadableStream<string>;
    private fromGameStreamController?: ReadableStreamDefaultController<string>;
    private ws?: WebSocket;
    private readonly server: TelnetServer;
    private readonly options: Map<number, TelnetOption> = new Map<number, TelnetOption>();
    private readonly capabilities: Capabilities = new Capabilities();
    private shuttingDown: boolean = false;
    private buffer = new Uint8Array(0);
    private wsDiedAwaitable?: Awaitable;
    private sessionData?: any;

    constructor(conn: Deno.Conn, server: TelnetServer) {
        this.conn = conn;
        this.server = server;
        this.capabilities.encryption = server.getTLS();

        const incoming = new TransformStream<Uint8Array, TelnetMessage>(new TelnetIncomingTransformer());
        const outgoing = new TransformStream<TelnetMessage, Uint8Array>(new TelnetOutgoingTransformer());

        this.incomingStream = conn.readable.pipeThrough(incoming);
        this.writerStream = conn.writable;
        this.outgoingStream = new ReadableStream<TelnetMessage>({
            start: (controller) => {
                this.sendController = controller;
            }
        });
        this.outgoingStream.pipeThrough(outgoing).pipeTo(this.writerStream);

        this.toGameStream = new ReadableStream<string>({
            start: (controller) => {
                this.toGameStreamController = controller;
            }
        });
        this.fromGameStream = new ReadableStream<string>({
            start: (controller) => {
                this.fromGameStreamController = controller;
            }
        });
    }

    public getAddr(): Deno.Addr {
        return this.conn.remoteAddr;
    }

    public getHostName(): string {
        let addr = this.conn.remoteAddr as Deno.NetAddr;
        return addr.hostname;
    }

    public toString(): string {
        const addr = this.conn.remoteAddr as Deno.NetAddr;
        return `TelnetProtocol(${addr.hostname}:${addr.port})`;

    }

    send(message: TelnetMessage) {
        if (this.sendController) {
            this.sendController.enqueue(message);
        } else {
            throw new Error("sendController is not initialized");
        }
    }

    public async run() {
        await Promise.all([this.runNegotiation(), this.runReader(), this.runWsWriter()]);
    }

    private async runNegotiation() {
        let negotiators: Awaitable[] = [];
        for (const op of OPTIONS) {
            const o = new op(this);
            this.options.set(o.getOptionCode(), o);
            o.startNegotiation();
            negotiators.push(...o.getNegotiators());
        }

        // await on negotiators for up to 250ms. It matters not what they respond with,
        // only that they all respond OR the timer expires.

        let promises = negotiators.map((n) => n.getPromise());

        // Create a timer promise
        const timerPromise = new Promise((resolve) => setTimeout(resolve, 250));

        // Race the negotiators against the timer
        await Promise.race([Promise.all(promises), timerPromise]);
        log.info(`${this}: Negotiation complete.`);

        this.startWebsocket();
    }

    private async runReader() {
        for await (const message of this.incomingStream) {
            // log.info(`Received ${TelnetMessageType[message.getType()]} message: ${message.getData()}`);
            switch(message.getType()) {
                case TelnetMessageType.COMMAND:
                    this.handleCommand(message);
                    break;
                case TelnetMessageType.NEGOTIATION:
                    this.handleNegotiation(message);
                    break;
                case TelnetMessageType.SUBNEGOTIATION:
                    this.handleSubnegotiation(message);
                    break;
                case TelnetMessageType.DATA:
                    this.handleData(message);
                    break;
            }
        }

        // Stream has ended because the client closed.
        log.info(`${this}: Connection closed by client.`);
        if(this.ws) {
            this.ws.send(JSON.stringify({"close": "Connection closed by client."}));
        }
        if(this.ws && (this.ws.readyState === WebSocket.OPEN)) {
            this.ws.close();
            this.ws = undefined;
        }
        this.toGameStreamController?.close();
        this.fromGameStreamController?.close();


    }

    private handleCommand(message: TelnetMessage) {
        // This does nothing for the moment...
    }

    private handleNegotiation(message: TelnetMessage) {
        const code = message.getCommand();
        const option = message.getOption();

        if(option === undefined) return;
        if(code === undefined) return;

        if(option in this.options) {
            this.options.get(option)?.onNegotiate(code);
        } else {
            switch(code) {
                case TelnetCode.WILL:
                    this.send(TelnetMessage.fromNegotiate(TelnetCode.DONT, option));
                    break;
                case TelnetCode.DO:
                    this.send(TelnetMessage.fromNegotiate(TelnetCode.WONT, option));
                    break;
                case TelnetCode.WONT:
                    this.send(TelnetMessage.fromNegotiate(TelnetCode.DONT, option));
                    break;
                case TelnetCode.DONT:
                    this.send(TelnetMessage.fromNegotiate(TelnetCode.WONT, option));
                    break;
            }
        }

    }

    private handleSubnegotiation(message: TelnetMessage) {
        const option = message.getOption();
        if(option === undefined) return;

        if(option in this.options) {
            const sub = message.getSub();
            if(sub === undefined) return;
            this.options.get(option)?.onSubNegotiate(sub);
        }

    }

    private handleData(message: TelnetMessage) {
        this.buffer = appendBytes(this.buffer, message.getData());

        // Conversion goes here...
        let lineEndIndex = scanForLineEndings(this.buffer);
        while (lineEndIndex !== -1) {
            const line = convertBufferToString(this.buffer.subarray(0, lineEndIndex));
            this.buffer = this.buffer.slice(lineEndIndex + 2); // +2 to skip over \r\n
            this.processLine(line);

            lineEndIndex = scanForLineEndings(this.buffer); // Rescan for the next line
        }
    }

    private processLine(line: string) {
        this.toGameStreamController?.enqueue(JSON.stringify({"text": line}));
    }

    private async runWsWriter() {
        // This method will send messages to the game server IF the websocket is connected.
        // If the websocket is not connected, it will wait until it is connected.
        const reader = this.toGameStream?.getReader();
        if(reader === undefined) return;

        while(!this.shuttingDown) {
            if(this.ws && (this.ws.readyState === WebSocket.OPEN)) {
                const { value, done } = await reader.read();
                if(!done) {
                    this.ws.send(value);
                } else {
                    break;
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    private async runWsReader() {
        // This method reads messages from this.fromGameStream, JSON.parse()'s them into Objects, then decides
        // what to do with them.
        this.wsDiedAwaitable = new Awaitable();
        const reader = this.fromGameStream?.getReader();
        if(reader === undefined) return;

        while(!this.shuttingDown) {
            const { value, done } = await reader.read();
            if(!done) {
                const message = JSON.parse(value);
                this.handleWsMessage(message);
            } else {
                break;
            }
        }

    }

    private handleWsMessage(message: any) {
        if("text" in message) {
            this.sendText(message["text"]);
        }
        if("prompt" in message) {
            this.sendText(message["prompt"], {"prompt": true});
        }
        if("close" in message) {
            this.handleWsClose(message["close"]);
        }
        if("session" in message) {
            this.sessionData = message["session"];
        }
        if("mssp" in message) {
            this.handleWsMSSP(message["mssp"]);
        }
    }

    private handleWsMSSP(mssp: any) {

    }

    public sendText(message: string, {prompt = false} = {}) {
        if(message === undefined) return;
        if(message.length < 1) {
            return;
        }

        // Clean up the message. Telnet dictates newlines are always in the form \r\n.
        // Just to be sure there's nothing silly like \r\r\r\r\n going on, we'll erase
        // ALL \r and replace all \n with \r\n.
        message = message.replaceAll("\r", "");
        message = message.replaceAll("\n", "\r\n");

        // handle forceEndline. If the message doesn't end with \r\n, add it.
        if(this.capabilities.forceEndline && !message.endsWith("\r\n")) {
            message += "\r\n";
        }

        this.send(TelnetMessage.fromData(new TextEncoder().encode(message)));
    }

    private handleWsClose(message: string) {
        log.info(`${this}: Websocket closed by game server: ${message}`);
        this.shuttingDown = true;
        if(message) {
            this.sendText(message);
        }
        if(this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        this.toGameStreamController?.close();
        this.fromGameStreamController?.close();
        this.conn.close();
    }

    private startWebsocket() {

        this.ws = new WebSocket("ws://localhost:4002");
        log.info(`${this}: Connecting websocket to game server...`);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = () => {
            log.info(`${this}: Websocket connected.`);
            let outData = {"capabilities": this.capabilities};
            if(this.sessionData) {
                outData = {...outData, ...{session: this.sessionData}};
            }
            this.ws?.send(JSON.stringify(outData));

        };
        this.ws.onmessage = (event) => {
            if(typeof event.data === 'string') {
                if(this.fromGameStreamController) {
                    this.fromGameStreamController.enqueue(event.data);
                }
            }
        };
        this.ws.onclose = () => {
            log.info(`${this}: Websocket disconnected.`);
            if(this.wsDiedAwaitable) {
                this.wsDiedAwaitable.trigger();
            }
            this.ws = undefined;
            if(!this.shuttingDown) {
                this.startWebsocket();
            }
        };
    }
}