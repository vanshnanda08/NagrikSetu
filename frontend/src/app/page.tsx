import { redirect } from "next/navigation";

/**
 * There is no landing page: the dashboard is the front door. The root URL stays
 * valid (the logo, bookmarks and old links all point at it) and forwards on.
 */
export default function RootPage() {
  redirect("/dashboard");
}
