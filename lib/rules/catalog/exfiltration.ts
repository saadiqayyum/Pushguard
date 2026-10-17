// Code that sends things out.
export const exfiltration = [
  {
    id: "environment-serialized",
    description: "The whole process environment packaged up, which is how credentials leave",
    severity: "critical",
    added_lines:
      "JSON\\.stringify\\(\\s*process\\.env|json\\.dumps\\(\\s*(os\\.environ|dict\\()|Object\\.(entries|assign|keys)\\(\\s*process\\.env|\\.\\.\\.process\\.env|btoa\\(\\s*JSON\\.stringify|(body|data|payload)\\s*[:=]\\s*process\\.env",
  },
  {
    id: "hardcoded-ip-address",
    description: "A network address written as a raw IP, which is how a beacon finds its server",
    severity: "high",
    added_lines:
      "['\"](?!(?:127|10|0|255)\\.|192\\.168\\.|172\\.(?:1[6-9]|2[0-9]|3[01])\\.)\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}['\"]|https?://\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}",
  },
  {
    id: "c2-decentralized-resolver",
    description: "A blockchain, IPFS, Nostr, DHT or calendar lookup, used by recent malware to find its server",
    severity: "high",
    paths: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,py}"],
    added_lines: [
      "ethers\\.(Contract|JsonRpcProvider|providers)|new Web3\\(|web3\\.eth\\.(call|Contract|getStorageAt)|\"eth_call\"",
      "api\\.trongrid\\.io|getSignaturesForAddress|bsc-dataseed",
      "ipfs\\.io/ipfs/|cloudflare-ipfs\\.com|dweb\\.link|gateway\\.pinata\\.cloud",
      "nostr-tools|wss://relay\\.|\\bnpub1[0-9a-z]{20}",
      "bittorrent-dht|new DHT\\(",
      "calendar\\.app\\.google/|api\\.github\\.com/search/commits",
    ],
  },
] as const
