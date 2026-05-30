import { getDb } from "./index";
import { createSource, createSystem, listSources, listSystems } from "./repo";

// Idempotent: only seeds when the tables are empty so we never clobber user edits.
export function seedDefaults(): void {
  getDb(); // ensure migrated

  if (listSources().length === 0) {
    createSource({
      name: "CISA Known Exploited Vulnerabilities",
      kind: "kev",
      url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    });
    createSource({
      name: "NVD Recent CVEs",
      kind: "nvd",
      url: "https://services.nvd.nist.gov/rest/json/cves/2.0",
    });
    createSource({
      name: "The Hacker News",
      kind: "rss",
      url: "https://feeds.feedburner.com/TheHackersNews",
    });
    createSource({
      name: "BleepingComputer",
      kind: "rss",
      url: "https://www.bleepingcomputer.com/feed/",
    });
  }

  if (listSystems().length === 0) {
    const seedSystems: Array<Parameters<typeof createSystem>[0]> = [
      {
        name: "Microsoft 365 / Azure",
        vendor: "Microsoft",
        keywords: "microsoft,azure,office,exchange,outlook,windows,sharepoint,active directory",
        criticality: "critical",
        severityThreshold: "high",
      },
      {
        name: "AWS",
        vendor: "Amazon",
        keywords: "aws,amazon web services,s3,ec2,lambda,iam,cloudfront",
        criticality: "critical",
        severityThreshold: "high",
      },
      {
        name: "Fortinet VPN",
        vendor: "Fortinet",
        keywords: "fortinet,fortios,fortigate,fortimanager,forticlient",
        criticality: "high",
        severityThreshold: "medium",
      },
      {
        name: "Cisco Network",
        vendor: "Cisco",
        keywords: "cisco,ios xe,anyconnect,asa,firepower",
        criticality: "high",
        severityThreshold: "medium",
      },
      {
        name: "Atlassian Suite",
        vendor: "Atlassian",
        keywords: "atlassian,confluence,jira,bitbucket",
        criticality: "medium",
        severityThreshold: "medium",
      },
      {
        name: "Citrix NetScaler",
        vendor: "Citrix",
        keywords: "citrix,netscaler,adc,gateway",
        criticality: "high",
        severityThreshold: "medium",
      },
      {
        name: "VMware",
        vendor: "VMware",
        keywords: "vmware,vcenter,esxi,vsphere,workspace one",
        criticality: "high",
        severityThreshold: "medium",
      },
    ];
    for (const s of seedSystems) createSystem(s);
  }
}
