import IssueListView from "@/components/complaints/IssueListView";
import IssueMapView from "@/components/complaints/IssueMapView";

export default async function ExploreIssuesPage({ searchParams }: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return view === "map" ? <IssueMapView /> : <IssueListView />;
}
