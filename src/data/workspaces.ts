import type { WorkspaceDoc } from "../types/index";

// The six workspaces db.json has held since Session 7, word for word.
// They are reference data: nobody creates a workspace through the API,
// so they live here and go into the database once, via src/seed.ts.
//
// itelect4-project kept these in its json-server db.json file.
// This is that same list, on the side of the wire that now owns it.
export const WORKSPACES: WorkspaceDoc[] = [
  {
    workspaceId: 101,
    title: "A.D.A.M. Command Center",
    description:
      "Accident Detection & Autonomous Monitoring real-time telemetry backend infrastructure.",
    createdAt: new Date("2026-08-01T09:00:00.000Z"),
  },
  {
    workspaceId: 102,
    title: "Cisco Core Routing Matrix",
    description:
      "Multi-VLAN core routing architecture, BGP peering, and redundant DHCPv4 server pools.",
    createdAt: new Date("2026-08-05T14:30:00.000Z"),
  },
  {
    workspaceId: 103,
    title: "CloudOps Kubernetes Fleet",
    description:
      "Production multi-region AWS EKS cluster hosting containerized microservices and service mesh.",
    createdAt: new Date("2026-08-12T11:15:00.000Z"),
  },
  {
    workspaceId: 104,
    title: "Apex Data Lakehouse",
    description:
      "Distributed data analytics pipeline powered by Apache Kafka, Spark streaming, and S3 vaults.",
    createdAt: new Date("2026-08-18T08:00:00.000Z"),
  },
  {
    workspaceId: 105,
    title: "Zero-Trust Security Perimeter",
    description:
      "Cloudflare Tunnel ingress gateways, automated IAM role policies, and WireGuard VPN tunnels.",
    createdAt: new Date("2026-08-25T16:45:00.000Z"),
  },
  {
    workspaceId: 106,
    title: "Edge AI Inference Cluster",
    description:
      "Ultra-low latency GPU cluster hosting vision models, Triton inference pods, and vLLM workers.",
    createdAt: new Date("2026-09-01T10:20:00.000Z"),
  },
];
