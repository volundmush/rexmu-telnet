import {TelnetProtocol} from "./protocol.ts";
import {log} from "../deps.ts";

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

    public addServer(options: Deno.ListenTlsOptions) {
        const server = new TelnetServer(options, this);
        this.servers.set(server.getPort(), server);
    }

    public getServer(port: number): TelnetServer | undefined {
        return this.servers.get(port);
    }

    public getServers(): IterableIterator<TelnetServer> {
        return this.servers.values();
    }

    public async run() {
        this.task = Promise.all(Array.from(this.servers.values()).map(server => server.run()));
        await this.task
    }

    public async shutdown() {
        if (this.task) {
            for (const server of this.servers.values()) {
                server.close();
            }
        }
        this.task = undefined;
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
}