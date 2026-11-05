// Static research references and bucket classification only. No feed endpoints or collection logic.
export const companyReferences = [
  {
    "name": "OpenAI",
    "url": "https://openai.com/careers/search/"
  },
  {
    "name": "Anthropic",
    "url": "https://www.anthropic.com/careers"
  },
  {
    "name": "Google DeepMind",
    "url": "https://deepmind.google/careers/"
  },
  {
    "name": "Google",
    "url": "https://www.google.com/about/careers/applications/jobs/results/?q=product%20analyst"
  },
  {
    "name": "Meta",
    "url": "https://www.metacareers.com/jobs/"
  },
  {
    "name": "Apple",
    "url": "https://jobs.apple.com/en-us/search?search=data%20scientist"
  },
  {
    "name": "Amazon",
    "url": "https://www.amazon.jobs/en/search?base_query=product+analyst"
  },
  {
    "name": "Microsoft",
    "url": "https://apply.careers.microsoft.com/careers"
  },
  {
    "name": "NVIDIA",
    "url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"
  },
  {
    "name": "Uber",
    "url": "https://www.uber.com/global/en/careers/list/"
  },
  {
    "name": "Lyft",
    "url": "https://www.lyft.com/careers"
  },
  {
    "name": "DoorDash",
    "url": "https://careersatdoordash.com/"
  },
  {
    "name": "Netflix",
    "url": "https://explore.jobs.netflix.net/careers"
  },
  {
    "name": "Airbnb",
    "url": "https://careers.airbnb.com/"
  },
  {
    "name": "Stripe",
    "url": "https://stripe.com/jobs/search"
  },
  {
    "name": "Roblox",
    "url": "https://careers.roblox.com/jobs"
  },
  {
    "name": "Coinbase",
    "url": "https://www.coinbase.com/careers/positions"
  },
  {
    "name": "Block",
    "url": "https://block.xyz/careers/jobs"
  },
  {
    "name": "Snowflake",
    "url": "https://careers.snowflake.com/us/en/search-results"
  },
  {
    "name": "Datadog",
    "url": "https://careers.datadoghq.com/all-jobs/"
  },
  {
    "name": "Palantir",
    "url": "https://www.palantir.com/careers/"
  },
  {
    "name": "Waymo",
    "url": "https://careers.withwaymo.com/jobs"
  },
  {
    "name": "Tesla",
    "url": "https://www.tesla.com/careers/search/"
  },
  {
    "name": "Cruise",
    "url": "https://www.getcruise.com/careers/"
  },
  {
    "name": "Zoox",
    "url": "https://zoox.com/careers"
  },
  {
    "name": "Aurora",
    "url": "https://aurora.tech/careers"
  },
  {
    "name": "Nuro",
    "url": "https://www.nuro.ai/careers"
  },
  {
    "name": "Motional",
    "url": "https://motional.com/careers"
  },
  {
    "name": "Cisco",
    "url": "https://cisco.wd5.myworkdayjobs.com/Cisco_Careers"
  },
  {
    "name": "Qualcomm",
    "url": "https://careers.qualcomm.com/careers"
  },
  {
    "name": "Broadcom",
    "url": "https://broadcom.wd1.myworkdayjobs.com/External_Career"
  },
  {
    "name": "AMD",
    "url": "https://careers.amd.com/careers-home/jobs"
  },
  {
    "name": "Adobe",
    "url": "https://adobe.wd5.myworkdayjobs.com/external_experienced"
  },
  {
    "name": "Salesforce",
    "url": "https://www.salesforce.com/company/careers/jobs/"
  },
  {
    "name": "ServiceNow",
    "url": "https://careers.servicenow.com/jobs/"
  },
  {
    "name": "Workday",
    "url": "https://workday.wd5.myworkdayjobs.com/Workday"
  },
  {
    "name": "HubSpot",
    "url": "https://www.hubspot.com/careers/jobs"
  },
  {
    "name": "Atlassian",
    "url": "https://www.atlassian.com/company/careers/all-jobs"
  },
  {
    "name": "Databricks",
    "url": "https://www.databricks.com/company/careers/open-positions"
  }
];
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function companyBucket(name: string) {
  const normalized = normalize(name);
  const establishedTech = [
    "Intel",
    "PayPal",
    "Venmo",
    "Cloudflare",
    "LinkedIn",
    "Applied Materials",
    "Micron",
    "Micron Technology",
    "Zebra",
    "Supermicro",
    "HP",
    "ViewSonic",
    "Veeva",
    "Veeva Systems",
    "Pinterest",
    "Motorola",
    "Sonos",
    "Booking.com",
    "Uber Freight",
    "Bending Spoons",
    "Coherent Corp.",
  ];
  if (establishedTech.some((company) => normalize(company) === normalized))
    return {
      category: "Mid-to-large tech",
      reason:
        "Established technology company registry; verify the specific employer and role.",
    };
  const otherEstablished = [
    "Booz Allen Hamilton",
    "Guidehouse",
    "Mastercard",
    "Visa",
    "BlackRock",
    "GAF",
    "Global Payments Inc.",
    "T-Mobile",
    "Noblis",
    "Medpace",
    "Dover",
    "Omnicom",
    "BCG X",
    "Frontier Airlines",
    "The Home Depot",
    "Resmed",
    "Abbott",
    "Arthrex",
    "Disney",
    "The Walt Disney Company",
    "CACI",
    "AbbVie",
    "Vanguard",
    "Gartner",
    "Publicis Groupe",
    "Eaton",
    "Citadel",
    "Honeywell Aerospace",
    "Equifax",
    "ABB",
  ];
  if (otherEstablished.some((company) => normalize(company) === normalized))
    return {
      category: "Other established companies",
      reason:
        "Established employer outside the technology / startup target mix.",
    };
  if (
    /tiktok|bytedance|alibaba|meituan|tencent|anker|jdcom|pdd|temu|shein|didi/.test(
      normalized,
    )
  )
    return {
      category: "Chinese global companies",
      reason: "Company identity matches the Chinese global company registry.",
    };
  if (
    companyReferences.some((s) => normalize(s.name) === normalized) ||
    /amazon|google|microsoft|adobe|nvidia|oracle|ibm|cisco|qualcomm|sap|intuit|indeed|dropbox|tempusai|ixllearning|stubhub|shopify|affirm|salesforce|bloomberg|hpe|hewlettpackard|servicenow|expedia|ebay|intuitive|autodesk|fivetran/.test(
      normalized,
    )
  )
    return {
      category: "Mid-to-large tech",
      reason:
        "Established technology company / target-company registry. Bucket is a research classification, not evidence of sponsorship.",
    };
  if (
    /idme|solace|nabla|handshake|scaleai|replit|ramp|brex|vercel|linear|notion|figma|mercor|luma|perplexity|sierra|clay|baseten|cursor|anysphere/.test(
      normalized,
    )
  )
    return {
      category: "Startups & small companies",
      reason:
        "Growth-stage / startup company registry; verify current company size.",
    };
  if (
    /bank|capital|bny|schwab|insurance|university|hospital|health|consult|deloitte|accenture|jpmorgan|fidelity|goldman|walmart|target|deere|procter|lowe|citi|defense|lockheed|northrop|boeing|raytheon|corning/.test(
      normalized,
    )
  )
    return {
      category: "Other established companies",
      reason:
        "Company name indicates financial services, healthcare, academia, consulting, retail or industry; outside the three tech target buckets.",
    };
  return {
    category: "Other / review needed",
    reason:
      "A category value is assigned, but there is not enough company evidence to assert size or origin. Review before including in the 60/20/20 target mix.",
  };
}
