import {TelnetMessage, TelnetMessageType} from "./codec.ts";
import {TelnetCode} from "./codes.ts";
import {appendBytes} from "./utils.ts";
import {ZlibEncoder, ZlibDecoder} from "../deps.ts";

export class TelnetIncomingTransformer implements Transformer<Uint8Array, TelnetMessage> {
    private buffer = new Uint8Array(0);
    private decoder?: ZlibDecoder;

    // Optional start method, called when the stream is constructed
    start(controller: TransformStreamDefaultController<TelnetMessage> ) {
        // Initialization code here, if needed
    }

    // The transform method, called with each chunk of data
    transform(chunk: Uint8Array, controller: TransformStreamDefaultController<TelnetMessage> ) {
        // Append new chunk to buffer
        if(this.decoder) {
            this.decoder.write(chunk);
            this.decoder.flush();
            chunk = this.decoder.read().copyAndDispose();
        }
        this.buffer = appendBytes(this.buffer, chunk);

        while (this.buffer.length > 0) {
            const { message, bytesRead } = TelnetMessage.fromBytes(this.buffer);

            if (!message || bytesRead === 0) {
                // Not enough data to form a complete message, wait for more data
                break;
            }

            // Enqueue the complete message
            controller.enqueue(message);

            // Remove processed bytes from buffer
            this.buffer = this.buffer.slice(bytesRead);

            if (message.getType() === TelnetMessageType.SUBNEGOTIATION) {
                if(message.getData()[4] == TelnetCode.MCCP3) {
                    if(!this.decoder) {
                        this.enableMCCP3();
                    }
                }
            }
        }
    }

    // Optional flush method, called when the stream is closing
    flush(controller: TransformStreamDefaultController<TelnetMessage> ) {
        // Handle any remaining data or cleanup here
        if(this.decoder) {
            this.disableMCCP3();
        }
    }

    enableMCCP3() {
        // Enable MCCP3. Create a new DeflateEncoder and set it to this.encoder.
        // We must assume that all data received after this point is compressed.
        this.decoder = new ZlibEncoder();
        this.decoder.write(this.buffer);
        this.decoder.flush();
        this.buffer = this.decoder.read().copyAndDispose();
    }

    disableMCCP3() {
        this.decoder.free();
        this.decoder = undefined;
    }
}


export class TelnetOutgoingTransformer implements Transformer<TelnetMessage, Uint8Array> {
    private encoder?: ZlibEncoder;

    // Optional start method, called when the stream is constructed
    start(controller: TransformStreamDefaultController<Uint8Array> ) {
        // Initialization code here, if needed
    }

    // The transform method, called with each chunk of data
    transform(chunk: TelnetMessage, controller: TransformStreamDefaultController<Uint8Array> ) {

        let data = chunk.getData();
        if(this.encoder) {
            this.encoder.write(data);
            this.encoder.flush();
            data = this.encoder.read().copyAndDispose();
        }

        // Enqueue the complete message
        controller.enqueue(data);

        if(chunk.getType() === TelnetMessageType.SUBNEGOTIATION) {
            if(chunk.getData()[4] == TelnetCode.MCCP2) {
                if(!this.encoder) {
                    this.enableMCCP2();
                }
            }
        }

    }

    // Optional flush method, called when the stream is closing
    flush(controller: TransformStreamDefaultController<Uint8Array> ) {
        // Handle any remaining data or cleanup here
        if(this.encoder) {
            this.disableMCCP2();
        }
    }

    enableMCCP2() {
        this.encoder = new ZlibEncoder(9);
    }

    disableMCCP2() {
        this.encoder.free();
        this.encoder = undefined;
    }
}