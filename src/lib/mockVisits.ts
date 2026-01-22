export type VisitEvent = {
  id: string;
  visitorId: string;
  pageCaption: string;
  timestamp: string;
  pageviewCount: number;
  durationSec: number;
};

export const visitEvents: VisitEvent[] = [
  {
    id: "event-1",
    visitorId: "user-101",
    pageCaption: "Anasayfa",
    timestamp: "2026-01-20T09:32:00Z",
    pageviewCount: 3,
    durationSec: 45,
  },
  {
    id: "event-2",
    visitorId: "user-202",
    pageCaption: "Son Dakika",
    timestamp: "2026-01-20T10:03:00Z",
    pageviewCount: 1,
    durationSec: 120,
  },
  {
    id: "event-3",
    visitorId: "user-303",
    pageCaption: "Ekonomi",
    timestamp: "2026-01-20T08:55:00Z",
    pageviewCount: 2,
    durationSec: 5,
  },
  {
    id: "event-4",
    visitorId: "user-101",
    pageCaption: "Spor",
    timestamp: "2026-01-20T10:12:00Z",
    pageviewCount: 4,
    durationSec: 32,
  },
  {
    id: "event-5",
    visitorId: "user-404",
    pageCaption: "Kültür",
    timestamp: "2026-01-20T05:50:00Z",
    pageviewCount: 1,
    durationSec: 0,
  },
  {
    id: "event-6",
    visitorId: "user-505",
    pageCaption: "Güncel",
    timestamp: "2026-01-19T17:30:00Z",
    pageviewCount: 6,
    durationSec: 87,
  },
  {
    id: "event-7",
    visitorId: "user-606",
    pageCaption: "Hava Durumu",
    timestamp: "2026-01-20T09:58:00Z",
    pageviewCount: 1,
    durationSec: 180,
  },
  {
    id: "event-8",
    visitorId: "user-707",
    pageCaption: "Ekonomi",
    timestamp: "2026-01-20T04:40:00Z",
    pageviewCount: 2,
    durationSec: 2,
  },
];
