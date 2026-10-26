// The test detail page. Its content (trend, commit strip, errors, quarantine) arrives in G9
// (T-30, T-31); for now it shows the test's id and a way back.
import { Link, useLocation, useParams } from "react-router-dom";

export function DetailPage() {
  const { id } = useParams();
  const { search } = useLocation();
  return (
    <main className="page">
      <Link className="back" to={{ pathname: "/", search }}>
        Back to all tests
      </Link>
      <h1 className="page__title">Test {id}</h1>
      <p className="page__lede">The detail view for this test is coming next.</p>
    </main>
  );
}
