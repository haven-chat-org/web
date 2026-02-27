import { useMemo } from "react";
import { Link } from "react-router-dom";
import DOMPurify from "dompurify";

/**
 * Terms of Service page.
 * Paste your Termly-generated HTML into the TOS_HTML constant below.
 */
const TOS_HTML = `
<h2>Terms of Service</h2>
<p>Terms of Service content has not been configured yet.</p>
`;

export default function Terms() {
  const sanitized = useMemo(() => ({ __html: DOMPurify.sanitize(TOS_HTML) }), []);

  return (
    <div className="terms-page">
      <div className="terms-container">
        {/* Static TOS content sanitized via DOMPurify — not user-supplied input */}
        <div className="terms-content" dangerouslySetInnerHTML={sanitized} />
        <div className="terms-back">
          <Link to="/register">&larr; Back to Registration</Link>
        </div>
      </div>
    </div>
  );
}
