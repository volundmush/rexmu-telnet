import {TelnetProtocol} from "./protocol.ts";
import {log} from "../deps.ts";
import {Awaitable} from "./utils.ts";


export class TelnetServer {
    private readonly listener: Deno.Listener;
    private readonly options: Deno.ListenTlsOptions;
    private readonly tls: boolean;
    public readonly manager: ServerManager;

    constructor(options: Deno.ListenTlsOptions, manager: ServerManager) {
        this.options = options;
        this.tls = ("cert" in options) && ("key" in options);
        this.listener = this.tls ? Deno.listenTls(options) : Deno.listen(options);
        this.manager = manager;
    }

    public getProtocolName(): string {
        return this.tls ? "telnets" : "telnet";
    }

    public getPort(): number {
        return this.options.port;
    }

    public getTLS(): boolean {
        return this.tls;
    }

    public getAddress(): string {
        let addr = this.listener.addr as Deno.NetAddr;
        return addr.hostname;
    }

    public async run() {
        log.info(`Listening on ${this.getProtocolName()}://${this.getAddress()}:${this.getPort()}`);
        for await (const conn of this.listener) {
            this.handleConn(conn);
        }
    }

    public close() {
        this.listener.close();
    }

    private async handleConn(conn: Deno.Conn) {
        const protocol = new TelnetProtocol(conn, this);
        this.manager.addClient(protocol);
        await protocol.run();
        this.manager.removeClient(protocol);
    }
}

export class ServerManager {
    private readonly servers: Map<number, TelnetServer> = new Map<number, TelnetServer>();
    private readonly clients: Map<string, TelnetProtocol> = new Map<string, TelnetProtocol>();
    private task?: Promise<void[]>;
    private quitting = false;
    private awaitable?: Awaitable;
    private config: Deno.ListenTlsOptions[];

    constructor(config: Deno.ListenTlsOptions[]) {
        this.config = config;
    }

    private addServer(options: Deno.ListenTlsOptions) {
        const server = new TelnetServer(options, this);
        const name = "telnets" ? server.getTLS() : "telnet";
        log.info(`Loading ${name} server on ${server.getAddress()}:${server.getPort()}`);
        this.servers.set(server.getPort(), server);
    }

    private getServers(): TelnetServer[] {
        return [...this.servers.values()];
    }

    private loadServers() {
        console.info("Loading servers...");
        for (const conf of this.config) {
            this.addServer(conf);
        }
    }

    public async run() {
        while(!this.quitting) {
            this.loadServers();
            // Create the awaitable which will be used to trigger shutdowns/reloads.
            this.awaitable = new Awaitable();
            console.info("Starting servers...");
            this.task = Promise.all(Array.from(this.getServers()).map(server => server.run()));
            await this.awaitable.getPromise();
            for (const server of this.getServers()) {
                server.close();
            }
            // Wait for all servers to close...
            await this.task;
            this.task = undefined;
            this.servers.clear();
        }
    }

    public async shutdown() {
        this.quitting = true;
        if(this.awaitable) {
            this.awaitable.trigger();
        }
    }

    public broadcast(message: string) {
        for (const client of this.clients.values()) {
            client.sendText(message);
        }
    }

    public addClient(client: TelnetProtocol) {
        log.info(`${client}: New connection.`);
        this.clients.set(client.getName(), client);
    }

    public removeClient(client: TelnetProtocol) {
        this.clients.delete(client.getName());
        log.info(`${client}: Connection closed.`);
    }

    public getClient(client: string) {
        return this.clients.get(client);
    }

    public registerSignalHandlers() {
        const sig: Deno.Signal[] = (Deno.build.os === "windows") ? ["SIGINT", "SIGBREAK"] : ["SIGUSR1", "SIGINT"];
        for (const s of sig) {
            Deno.addSignalListener(s, () => {
                this.signalHandler(s);
            });
        }
    }

    public signalHandler(sig: Deno.Signal) {
        switch(sig) {
            case "SIGINT":
                log.critical(`Received ${sig}! Performing graceful shutdown...`);
                this.shutdown();
                break;
            case "SIGBREAK":
            case "SIGUSR1":
                log.critical(`Received ${sig}! Performing reload...`);
                this.reload();
                break;
        }
    }

    public reload() {
        if(this.awaitable) {
            this.awaitable.trigger();
        }
    }
}