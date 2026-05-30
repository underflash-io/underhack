// Curated list of major, broadly-impactful breaches and exploited vulnerabilities.
// The intake chatbot walks through these to learn the operator's exposure and
// suggest monitored-systems entries from their answers.
export interface MajorBreach {
  key: string;
  name: string;
  year: number;
  category: "vuln" | "supply_chain" | "data_breach";
  vendor: string;
  cve?: string;
  summary: string;
  monitor_keywords: string[]; // seed keywords for a Systems entry
}

export const MAJOR_BREACHES: MajorBreach[] = [
  {
    key: "log4shell",
    name: "Log4Shell",
    year: 2021,
    category: "vuln",
    vendor: "Apache",
    cve: "CVE-2021-44228",
    summary: "Remote code execution in Apache Log4j 2 via crafted JNDI lookups in logged strings.",
    monitor_keywords: ["log4j", "log4j2", "apache log4j"],
  },
  {
    key: "moveit",
    name: "MOVEit Transfer",
    year: 2023,
    category: "vuln",
    vendor: "Progress",
    cve: "CVE-2023-34362",
    summary: "SQL injection in MOVEit Transfer exploited by Cl0p to exfiltrate data from hundreds of organizations.",
    monitor_keywords: ["moveit", "progress moveit", "moveit transfer"],
  },
  {
    key: "solarwinds",
    name: "SolarWinds Orion / SUNBURST",
    year: 2020,
    category: "supply_chain",
    vendor: "SolarWinds",
    summary: "Supply-chain compromise of SolarWinds Orion updates affecting thousands of downstream organizations.",
    monitor_keywords: ["solarwinds", "orion", "sunburst"],
  },
  {
    key: "proxylogon",
    name: "Microsoft Exchange ProxyLogon",
    year: 2021,
    category: "vuln",
    vendor: "Microsoft",
    cve: "CVE-2021-26855",
    summary: "Server-side request forgery chained with RCE in on-premises Microsoft Exchange.",
    monitor_keywords: ["exchange", "outlook web access", "owa", "proxylogon"],
  },
  {
    key: "spring4shell",
    name: "Spring4Shell",
    year: 2022,
    category: "vuln",
    vendor: "VMware (Spring)",
    cve: "CVE-2022-22965",
    summary: "Remote code execution via data binding in Spring Framework on JDK 9+.",
    monitor_keywords: ["spring framework", "spring-beans", "spring-webmvc"],
  },
  {
    key: "citrix_bleed",
    name: "Citrix Bleed",
    year: 2023,
    category: "vuln",
    vendor: "Citrix",
    cve: "CVE-2023-4966",
    summary: "Sensitive memory disclosure in NetScaler ADC/Gateway leading to session hijacking.",
    monitor_keywords: ["netscaler", "citrix adc", "citrix gateway"],
  },
  {
    key: "equifax",
    name: "Equifax 2017 (Apache Struts)",
    year: 2017,
    category: "vuln",
    vendor: "Apache",
    cve: "CVE-2017-5638",
    summary: "Apache Struts RCE exploited to breach 147M consumer records at Equifax.",
    monitor_keywords: ["struts", "apache struts"],
  },
  {
    key: "heartbleed",
    name: "Heartbleed",
    year: 2014,
    category: "vuln",
    vendor: "OpenSSL",
    cve: "CVE-2014-0160",
    summary: "Memory disclosure in OpenSSL TLS heartbeat extension exposing keys and session data.",
    monitor_keywords: ["openssl"],
  },
  {
    key: "connectwise_screenconnect",
    name: "ConnectWise ScreenConnect",
    year: 2024,
    category: "vuln",
    vendor: "ConnectWise",
    cve: "CVE-2024-1709",
    summary: "Authentication bypass in ScreenConnect leading to administrative takeover.",
    monitor_keywords: ["connectwise", "screenconnect"],
  },
  {
    key: "fortinet_fortios",
    name: "Fortinet FortiOS / FortiGate SSL-VPN",
    year: 2023,
    category: "vuln",
    vendor: "Fortinet",
    cve: "CVE-2023-27997",
    summary: "Heap-based buffer overflow in Fortinet SSL-VPN exploited in the wild.",
    monitor_keywords: ["fortinet", "fortios", "fortigate", "ssl-vpn"],
  },
  {
    key: "okta_support",
    name: "Okta Support System Breach",
    year: 2023,
    category: "data_breach",
    vendor: "Okta",
    summary: "Attacker accessed Okta's support case system, exposing HAR files with session tokens.",
    monitor_keywords: ["okta"],
  },
  {
    key: "lastpass",
    name: "LastPass Vault Breach",
    year: 2022,
    category: "data_breach",
    vendor: "LastPass",
    summary: "Encrypted password vaults exfiltrated; subject to offline cracking.",
    monitor_keywords: ["lastpass"],
  },
];
