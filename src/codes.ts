export enum TelnetCode {
    NULL = 0,
    SGA = 3,
    BEL = 7,
    LF = 10,
    CR = 13,


    // MTTS - Terminal Type
    MTTS = 24,

    TELOPT_EOR = 25,

    // NAWS: Negotiate About Window Size
    NAWS = 31,
    LINEMODE = 34,

    // MNES: Mud New-Environ standard
    MNES = 39,

    // MSDP - Mud Server Data Protocol
    MSDP = 69,

    // Mud Server Status Protocol
    MSSP = 70,

    // Compression
    // pub const MCCP1: u8 = 85 - this is deprecrated
    // NOTE: MCCP2 and MCCP3 is currently disabled.
    MCCP2 = 86,
    MCCP3 = 87,

    // MUD eXtension Protocol
    // NOTE: Disabled due to too many issues with it.
    MXP = 91,

    // GMCP - Generic Mud Communication Protocol
    GMCP = 201,

    EOR = 239,
    SE = 240,
    NOP = 241,
    GA = 249,

    SB = 250,
    WILL = 251,
    WONT = 252,
    DO = 253,
    DONT = 254,

    IAC = 255,
}