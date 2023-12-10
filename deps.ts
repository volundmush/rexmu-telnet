import { Foras, deflate, inflate, ZlibEncoder, ZlibDecoder } from "https://deno.land/x/foras@v2.1.4/src/deno/mod.ts";
import * as log from "https://deno.land/std@0.208.0/log/mod.ts";
Foras.initBundledOnce();

export { log, ZlibEncoder, ZlibDecoder };