/**
 * Nonprofit attribution / legitimacy disclosure shown under every signup form.
 * (Founder + 501(c)(3) operator + official portal.) Content is fixed per the
 * program's legal wording — do not paraphrase.
 */
export default function ProgramDisclosure({ style }: { style?: React.CSSProperties }) {
  return (
    <p
      style={{
        fontSize: 11.5,
        lineHeight: 1.65,
        color: 'var(--muted, #a9a396)',
        textAlign: 'center',
        margin: '18px auto 0',
        maxWidth: 580,
        ...style,
      }}
    >
      The <em>Leave It Better Than You Found It</em>™ Student Impact Challenge is founded by
      Frantz Coutard and presented and operated by <strong>TrendCatch Gives Back Inc.</strong>,
      a 501(c)(3) tax-exempt nonprofit organization recognized by the Internal Revenue Service (IRS).
      FrantzCoutard.com serves as the official registration and information portal for the program.
    </p>
  )
}
