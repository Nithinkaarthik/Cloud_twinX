const CloudBadge = ({ cloud }) => {
  const colors = { aws: "#FF9900", gcp: "#4285F4", azure: "#0089D6" };
  const labels = { aws: "AWS", gcp: "GCP", azure: "Azure" };

  return (
    <span
      style={{
        background: colors[cloud] + "22",
        color: colors[cloud],
        border: `1px solid ${colors[cloud]}44`,
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "monospace",
        letterSpacing: 1,
      }}
    >
      {labels[cloud]}
    </span>
  );
};

export default CloudBadge;
