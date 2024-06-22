interface ContractAddresses {
    quoter: string;
    router: string;
}

type NetworkNames = 'zkSync' | 'Linea' | 'Base' | 'Scroll' | 'Manta';

const IZUMI_CONTRACTS: Record<NetworkNames, ContractAddresses> = {
    zkSync: {
        quoter: '0x30C089574551516e5F1169C32C6D429C92bf3CD7',
        router: '0x943ac2310D9BC703d6AB5e5e76876e212100f894',
    },
    Linea: {
        quoter: '0xe6805638db944eA605e774e72c6F0D15Fb6a1347',
        router: '0x032b241De86a8660f1Ae0691a4760B426EA246d7',
    },
    Base: {
        quoter: '0x2db0AFD0045F3518c77eC6591a542e326Befd3D7',
        router: '0x02F55D53DcE23B4AA962CC68b0f685f26143Bdb2',
    },
    Scroll: {
        quoter: '0x3EF68D3f7664b2805D4E88381b64868a56f88bC4',
        router: '0x2db0AFD0045F3518c77eC6591a542e326Befd3D7',
    },
    Manta: {
        quoter: '0x33531bDBFE34fa6Fd5963D0423f7699775AacaaF',
        router: '0x3EF68D3f7664b2805D4E88381b64868a56f88bC4',
    },
};

export { IZUMI_CONTRACTS, ContractAddresses, NetworkNames };
