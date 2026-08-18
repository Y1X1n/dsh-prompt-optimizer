/** 手绘的"闪光"图标:一大一小两颗四芒星(AI 功能的常见语义)。 */
export function SparkleIcon(props: { size?: number; spinning?: boolean }) {
  const size = props.size ?? 14
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* 主星(左上) */}
      <path
        d="M10 2 L11.6 8.4 L18 10 L11.6 11.6 L10 18 L8.4 11.6 L2 10 L8.4 8.4 Z"
        fill="currentColor"
      />
      {/* 伴星(右下) */}
      <path
        d="M17.5 14 L18.3 16.7 L21 17.5 L18.3 18.3 L17.5 21 L16.7 18.3 L14 17.5 L16.7 16.7 Z"
        fill="currentColor"
      />
      {props.spinning && (
        <animate attributeName="opacity" values="1;0.35;1" dur="1.1s" repeatCount="indefinite" />
      )}
    </svg>
  )
}
