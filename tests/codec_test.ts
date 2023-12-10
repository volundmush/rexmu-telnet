import {
    assertEquals,
    assertNotEquals,
    // ... other necessary assertions
} from "https://deno.land/std/testing/asserts.ts";

import {TelnetMessage, TelnetMessageType} from "../src/codec.ts";
import {TelnetCode} from "../src/codes.ts";
import {assertExists} from "https://deno.land/std@0.208.0/testing/asserts.ts";

Deno.test("TelnetMessage.fromData() returns undefined when data is empty", () => {
    const { message , bytesRead} = TelnetMessage.fromBytes(new Uint8Array([]));
    assertEquals(message, undefined);
    assertEquals(bytesRead, 0);
});

Deno.test("TelnetMessage.fromData() returns undefined when given insufficient IAC data.",() => {
    const { message, bytesRead } = TelnetMessage.fromBytes(new Uint8Array([TelnetCode.IAC]));
    assertEquals(message, undefined);
    assertEquals(bytesRead, 0);
});

Deno.test("TelnetMessage.fromData() returns undefined when given insufficient IAC NEGOTIATION data.",() => {
    const { message, bytesRead } = TelnetMessage.fromBytes(new Uint8Array([TelnetCode.IAC, TelnetCode.WILL]));
    assertEquals(message, undefined);
    assertEquals(bytesRead, 0);
});

Deno.test("TelnetMessage.fromData() returns undefined when given insufficient IAC SUBNEGOTIATION data.",() => {
    const { message, bytesRead } = TelnetMessage.fromBytes(new Uint8Array([TelnetCode.IAC, TelnetCode.SB, 200, 36, 39]));
    assertEquals(message, undefined);
    assertEquals(bytesRead, 0);
});

Deno.test("TelnetMessage.fromData() returns an escaped IAC when given [IAC, IAC]", () => {
    const { message, bytesRead } = TelnetMessage.fromBytes(new Uint8Array([TelnetCode.IAC, TelnetCode.IAC]));
    assertExists(message);
    assertEquals(message.getType(), TelnetMessageType.DATA);
    assertEquals(message.getData(), new Uint8Array([TelnetCode.IAC]));
    assertEquals(bytesRead, 2);
});

Deno.test("TelnetMessage.fromData() returns a IAC COMMAND when given [IAC, 200]", () => {
    const { message, bytesRead } = TelnetMessage.fromBytes(new Uint8Array([TelnetCode.IAC, 200]));
    assertExists(message);
    assertEquals(message.getType(), TelnetMessageType.COMMAND);
    assertEquals(message.getData(), new Uint8Array([TelnetCode.IAC, 200]));
    assertEquals(bytesRead, 2);
});

Deno.test("TelnetMessage.fromData() returns text as .DATA if given text.", () => {
    const { message, bytesRead } = TelnetMessage.fromBytes(new TextEncoder().encode("Hello World"));
    assertExists(message);
    assertEquals(message.getType(), TelnetMessageType.DATA);
    assertEquals(message.getData(), new TextEncoder().encode("Hello World"));
    assertEquals(bytesRead, 11);
});

Deno.test("TelnetMessage.fromData() returns a negotiation if given IAC WILL 200", () => {
    const { message, bytesRead } = TelnetMessage.fromBytes(new Uint8Array([TelnetCode.IAC, TelnetCode.WILL, 200]));
    assertExists(message);
    assertEquals(message.getType(), TelnetMessageType.NEGOTIATION);
    assertEquals(message.getData(), new Uint8Array([TelnetCode.IAC, TelnetCode.WILL, 200]));
    assertEquals(bytesRead, 3);
});

Deno.test("TelnetMessage.fromData() returns a subnegotiation if given IAC SB 200 36 39 IAC SE", () => {
    const data = new Uint8Array([TelnetCode.IAC, TelnetCode.SB, 200, 36, 39, TelnetCode.IAC, TelnetCode.SE]);
    const { message, bytesRead } = TelnetMessage.fromBytes(data);
    assertExists(message);
    assertEquals(message.getType(), TelnetMessageType.SUBNEGOTIATION);
    assertEquals(message.getData(), data);
    assertEquals(bytesRead, 7);
});