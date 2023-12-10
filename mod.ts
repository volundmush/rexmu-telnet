import { signal } from "https://deno.land/std/signal/mod.ts";
import {ServerManager} from "./src/server.ts";
import {log} from "./deps.ts";


async function startServer() {
    const manager = new ServerManager();
    manager.addServer({ port: 4000 });
    await manager.run();
}

function shutdownServer() {
    // Logic to gracefully shut down the server...
}

async function main() {
    log.setup({
        handlers: {
            console: new log.handlers.ConsoleHandler("INFO"),
        },

        loggers: {
            default: {
                level: "INFO",
                handlers: ["console"],
            },
        },
    });

    const sig: Deno.Signal[] = (Deno.build.os === "windows") ? ["SIGINT", "SIGBREAK"] : ["SIGUSR1", "SIGINT"];

    startServer();
    for (const s of sig) {
        Deno.addSignalListener(s, () => {
            log.info(`Received ${s}!`);
            log.info("Shutting down...");
            shutdownServer();
            Deno.exit(0);
        });
    }

}


if (import.meta.main) await main()