import { Link } from 'react-router-dom'
import { SocialLinks } from './SocialIcons'

const logo = '/assets/fc-logo.png'

/* Shared footer used across pages. The subscribe form id (`subscribe-form`)
   is wired by useSiteInteractions to the API. */
export default function SiteFooter() {
  return (
    <footer className="footer" id="site-footer">
      <div className="wrap">
        <div className="footer__top">
          <div className="footer__brand">
            <div className="fmono">
              <span className="lm"><img src={logo} alt="FC" /></span>
              <div><div className="fname gold-text">Frantz Coutard</div><div className="ftag">From Community to Legacy</div></div>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 20, maxWidth: 260 }}>Building technology that serves people - connecting businesses, communities, and opportunity.</p>
          </div>

          <div>
            <h5>Stay Connected</h5>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Get updates on new projects, events, and community initiatives.</p>
            <form className="subscribe" id="subscribe-form">
              <input type="email" placeholder="Enter your email" required aria-label="Email" />
              <button type="submit">Subscribe</button>
            </form>
          </div>

          <div>
            <h5>Navigation</h5>
            <ul>
              <li><Link to="/about">About</Link></li>
              <li><Link to="/projects">Projects</Link></li>
              <li><Link to="/awards">Awards</Link></li>
              <li><a href="/#speaking">Speaking</a></li>
              <li><Link to="/events">Events</Link></li>
              <li><Link to="/media">Media</Link></li>
              <li><Link to="/community">Community</Link></li>
              <li><Link to="/store">Merchandise</Link></li>
              <li><Link to="/blog">Blog &amp; News</Link></li>
            </ul>
          </div>

          <div>
            <h5>Get Involved</h5>
            <ul>
              <li><a href="/#broker">Broker Academy</a></li>
              <li><a href="/#mentorship">Mentorship</a></li>
              <li><a href="/#engage">Sponsor</a></li>
              <li><a href="/#engage">Invite Frantz</a></li>
              <li><a href="/#partners">Partners</a></li>
              <li><a href="/#press">Press &amp; Media</a></li>
            </ul>
          </div>

          <div className="footer__sign">
            <div className="sg">Frantz Coutard</div>
            <div className="sgt">Building Technology<br />That Serves People</div>
          </div>
        </div>

        <div className="footer__bar">
          <div className="cr">&copy; 2026 Frantz Coutard. All Rights Reserved.</div>
          <SocialLinks variant="bar" />
        </div>
      </div>
    </footer>
  )
}
