import {
  IconHome,
  IconMenu2,
  IconPlus,
  IconSettings,
  IconX,
} from '@tabler/icons-react'
import { montserrat_heading } from 'fonts'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/shadcn/ui/button'
import { usePostHog } from 'posthog-js/react'
import { useAuth } from 'react-oidc-context'
import HomeContext from '~/components/home/home.context'
import { UserSettings } from '../../Chat/UserSettings'
import { ThemeToggle } from '../ThemeToggle'
import { AuthMenu } from './AuthMenu'

const styles: Record<string, React.CSSProperties> = {
  logoContainerBox: {
    height: '52px',
    maxWidth:
      typeof window !== 'undefined' && window.innerWidth > 600 ? '80%' : '100%',
    paddingLeft:
      typeof window !== 'undefined' && window.innerWidth > 600 ? '25px' : '5px',
  },
  thumbnailImage: {
    objectFit: 'cover',
    objectPosition: 'center',
    height: '100%',
    width: 'auto',
  },
}

const HEADER_HEIGHT = 60

// Base `.link` look, ported from the old `createStyles` `link` slot. The
// narrow-viewport `list-item` variant it also defined is dropped — the
// buttons it applied to are already hidden below their own breakpoints, so
// the compact variant covered only a sliver of widths and wasn't visually
// load-bearing (see docs/mantine-retirement-styles-notes.md).
const linkClassName =
  'text-(--navbar-text) text-xs font-bold text-center no-underline transition-colors duration-100 rounded-(--radius-sm) hover:text-(--button-hover-text-color) hover:bg-(--button-hover)'

interface ChatNavbarProps {
  bannerUrl?: string
  isgpt4?: boolean
}

const ChatNavbar = ({ bannerUrl = '', isgpt4 = true }: ChatNavbarProps) => {
  const router = useRouter()
  const [opened, setOpened] = useState(false)
  const toggle = useCallback(() => setOpened((v) => !v), [])
  const [show, setShow] = useState(true)
  const [isAdminOrOwner, setIsAdminOrOwner] = useState(false)
  const auth = useAuth()

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 825,
  )
  const posthog = usePostHog()
  const {
    state: { showModelSettings, selectedConversation },
    dispatch: homeDispatch,
    handleNewConversation,
  } = useContext(HomeContext)

  const topBarRef = useRef<HTMLDivElement | null>(null)
  const getCurrentCourseName = () => {
    return router.asPath.split('/')[1]
  }

  // Breakpoints ported from the old `createStyles` slots, which varied by
  // `isAdminOrOwner` (theme.fn.smallerThan/largerThan).
  const burgerBreakpoint = isAdminOrOwner ? 825 : 500
  const settingsBreakpoint = isAdminOrOwner ? 675 : 500
  const newChatBreakpoint = isAdminOrOwner ? 500 : 350
  const showBurger = windowWidth <= burgerBreakpoint
  const showNewChatLink = windowWidth > newChatBreakpoint
  const showSettingsLink = windowWidth > settingsBreakpoint
  const showAdminDashboardLink = windowWidth > 825

  useEffect(() => {
    const fetchCourses = async () => {
      if (auth.isAuthenticated) {
        const userEmail = auth.user?.profile.email
        const currUserEmails = userEmail ? [userEmail] : []
        posthog?.identify(auth.user?.profile.sub, {
          email: currUserEmails[0] || 'no_email',
        })

        const response = await fetch(
          `/api/UIUC-api/getCourseMetadata?course_name=${getCurrentCourseName()}`,
        )
        const courseMetadata = await response.json().then((data) => {
          return data['course_metadata']
        })

        if (
          currUserEmails.includes(courseMetadata.course_owner) ||
          currUserEmails.some((email) =>
            courseMetadata.course_admins?.includes(email),
          )
        ) {
          setIsAdminOrOwner(true)
        } else {
          setIsAdminOrOwner(false)
        }
      }
    }
    fetchCourses()
  }, [auth.isAuthenticated])

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
      if (isAdminOrOwner && window.innerWidth > 825) {
        opened && toggle()
      } else if (!isAdminOrOwner && window.innerWidth > 500) {
        opened && toggle()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [opened, toggle])

  return (
    <div
      className={`mr-0 bg-(--navbar-background) px-12 pb-16 pl-5`}
      style={{ display: show ? 'block' : 'none' }}
    >
      <div
        style={{
          paddingTop: 'Opx',
          maxWidth: '100vw',
          marginRight: '0px',
          paddingLeft: '17px',
        }}
      >
        {/* can remove in future. navbar had rounded-badge bg-(--navbar-background) shadow-lg shadow-(--navbar-shadow) */}
        <div className="flex min-h-16 w-full flex-row flex-nowrap items-center justify-start gap-0 p-2">
          <Link
            href="/"
            className="flex items-center"
            style={{ flex: 'none', flexWrap: 'nowrap' }}
          >
            <h2 className="cursor-pointer font-extrabold tracking-tight text-(--primary) sm:ms-3 sm:text-[2rem] md:text-3xl">
              Illinois <span className="text-(--navbar-text)">Chat</span>
            </h2>
          </Link>

          <div className="flex items-center pl-4">
            <ThemeToggle />
          </div>

          {bannerUrl ? (
            <div
              className="flex"
              style={{ ...styles.logoContainerBox, flex: '1' }}
            >
              <Image
                src={bannerUrl}
                style={{ ...styles.thumbnailImage }}
                width={2000}
                height={2000}
                alt={`${getCurrentCourseName()} logo`}
                aria-label={`${getCurrentCourseName()} logo`}
                onError={(e) => (e.currentTarget.style.display = 'none')} // display nothing if image fails
              />
            </div>
          ) : (
            // Placeholder div
            <div
              className="flex"
              style={{
                ...styles.logoContainerBox,
                flex: '1',
                visibility: 'hidden',
              }}
            ></div>
          )}

          <div className="ml-auto flex flex-nowrap items-center">
            {/* This is the hamburger menu / dropdown (was Mantine <Transition pop-top-right> + <Paper>) */}
            {opened && (
              <div
                data-testid="hamburger-menu"
                className="animate-in fade-in-0 zoom-in-95 absolute z-10 min-w-[120px] overflow-hidden rounded-[4px] border border-(--background-dark) bg-(--background-faded) text-(--foreground) duration-200"
                style={{
                  top: HEADER_HEIGHT,
                  right: '20px',
                  transform: 'translateY(26px)',
                }}
              >
                {/* New Chat button in hamburger when screen is small */}
                <div
                  className={linkClassName}
                  style={{
                    display:
                      windowWidth <= (isAdminOrOwner ? 500 : 350) && opened
                        ? 'block'
                        : 'none',
                    padding: 0,
                  }}
                >
                  <div
                    onClick={() => {
                      handleNewConversation()
                      toggle()
                      setTimeout(() => {
                        const chatInput = document.querySelector(
                          'textarea.chat-input',
                        ) as HTMLTextAreaElement
                        if (chatInput) {
                          chatInput.focus()
                        }
                      }, 100)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      cursor: 'pointer',
                      height: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <IconPlus size={24} aria-hidden="true" />
                      <span
                        className={`${montserrat_heading.variable} font-montserratHeading`}
                        style={{ marginLeft: '8px' }}
                      >
                        New Chat
                      </span>
                    </div>
                  </div>
                </div>

                {/* Settings button in hamburger when screen is small */}
                <div
                  className={linkClassName}
                  style={{
                    display: windowWidth <= 675 && opened ? 'block' : 'none',
                    padding: 0,
                  }}
                >
                  <div
                    onClick={() => {
                      homeDispatch({
                        field: 'showModelSettings',
                        value: !showModelSettings,
                      })
                      toggle()
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      cursor: 'pointer',
                      height: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <IconSettings size={24} aria-hidden="true" />
                      <span
                        className={`${montserrat_heading.variable} font-montserratHeading`}
                        style={{ marginLeft: '8px' }}
                      >
                        Settings
                      </span>
                    </div>
                  </div>
                </div>

                {/* Admin Dashboard in hamburger when screen is small */}
                {isAdminOrOwner && (
                  <div
                    className={linkClassName}
                    style={{
                      display: windowWidth <= 825 && opened ? 'block' : 'none',
                      padding: 0,
                    }}
                  >
                    <Link
                      href={`/${getCurrentCourseName()}/dashboard`}
                      onClick={() => toggle()}
                      style={{
                        width: '100%',
                        padding: '8px',
                        cursor: 'pointer',
                        textDecoration: 'none',
                        color: 'inherit',
                        display: 'block',
                        height: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <IconHome size={24} aria-hidden="true" />
                        <span
                          className={`${montserrat_heading.variable} font-montserratHeading`}
                          style={{ marginLeft: '8px' }}
                        >
                          Admin Dashboard
                        </span>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* This is the main links on top  */}
            <div
              className="flex h-[60px] items-center justify-between"
              style={{ padding: 0, margin: 0 }}
            >
              {showNewChatLink && (
                <button
                  className={linkClassName}
                  style={{ padding: '3px 8px', minWidth: '100px' }}
                  onClick={() => {
                    handleNewConversation()
                    setTimeout(() => {
                      const chatInput = document.querySelector(
                        'textarea.chat-input',
                      ) as HTMLTextAreaElement
                      if (chatInput) {
                        chatInput.focus()
                      }
                    }, 100)
                  }}
                  aria-label="Start a new chat"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                    }}
                  >
                    <IconPlus
                      size={24}
                      aria-hidden="true"
                      style={{
                        position: 'relative',
                        top: '-2px',
                        paddingLeft: '-3px',
                      }}
                    />
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-center',
                        padding: '0px',
                        height: '40px',
                        whiteSpace: 'nowrap',
                        marginLeft: '5px',
                      }}
                    >
                      <span
                        style={{ whiteSpace: 'nowrap' }}
                        className={`${montserrat_heading.variable} font-montserratHeading`}
                      >
                        New Chat
                      </span>
                    </span>
                  </div>
                </button>
              )}
              {showSettingsLink && (
                <button
                  className={linkClassName}
                  style={{ padding: '3px 8px', minWidth: '100px' }}
                  onClick={() => {
                    homeDispatch({
                      field: 'showModelSettings',
                      value: !showModelSettings,
                    })
                  }}
                  aria-label={`Open or close show model settings.`}
                >
                  <div
                    ref={topBarRef}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                    }}
                  >
                    <IconSettings
                      size={24}
                      aria-hidden="true"
                      style={{
                        position: 'relative',
                        top: '-2px',
                        paddingLeft: '-3px',
                      }}
                    />
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-center',
                        padding: '0px',
                        height: '40px',
                        whiteSpace: 'nowrap',
                        marginLeft: '5px',
                      }}
                    >
                      <span
                        style={{ whiteSpace: 'nowrap' }}
                        className={`${montserrat_heading.variable} font-montserratHeading`}
                      >
                        Settings
                      </span>
                    </span>
                  </div>
                </button>
              )}
              {isAdminOrOwner && showAdminDashboardLink && (
                <button
                  className={linkClassName}
                  style={{ padding: '3px 8px', minWidth: '100px' }}
                  onClick={(e) => {
                    // Handle click with modifier keys
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                      window.open(
                        `/${getCurrentCourseName()}/dashboard`,
                        '_blank',
                      )
                    } else {
                      router.push(`/${getCurrentCourseName()}/dashboard`)
                    }
                  }}
                  onAuxClick={(e) => {
                    // Handle middle click (button 1)
                    if (e.button === 1) {
                      window.open(
                        `/${getCurrentCourseName()}/dashboard`,
                        '_blank',
                      )
                    }
                  }}
                  onContextMenu={(e) => {
                    // Don't prevent default to allow normal right-click menu
                    // But add the URL to the clipboard
                    navigator.clipboard.writeText(
                      `${
                        window.location.origin
                      }/${getCurrentCourseName()}/dashboard`,
                    )
                  }}
                  aria-label={`Go to dashboard`}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    <IconHome
                      size={30}
                      strokeWidth={2}
                      aria-hidden="true"
                      style={{
                        marginRight: '4px',
                        marginLeft: '4px',
                        position: 'relative',
                        top: '-2px',
                      }}
                    />
                    <span
                      style={{
                        backgroundImage:
                          "url('/media/hero-header-underline-reflow.svg')",
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: 'contain',
                        backgroundPosition: 'bottom',
                        width: '100%',
                        height: '40px',
                        position: 'relative',
                        top: '13px',
                      }}
                    >
                      <span
                        className={`${montserrat_heading.variable} font-montserratHeading`}
                      >
                        Admin Dashboard
                      </span>
                    </span>
                  </div>
                </button>
              )}
              <div
                style={{
                  position: 'absolute',
                  zIndex: 100,
                  right: '30px',
                  top: '75px',
                }}
              >
                <UserSettings />
              </div>
            </div>

            <div style={{ padding: 0, margin: 0 }}>
              {showBurger && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={toggle}
                  aria-label="Toggle burger menu"
                  aria-expanded={opened}
                  className="mr-[3px] ml-0"
                >
                  {opened ? (
                    <IconX
                      size={20}
                      aria-hidden="true"
                      color="var(--foreground)"
                    />
                  ) : (
                    <IconMenu2
                      size={20}
                      aria-hidden="true"
                      color="var(--foreground)"
                    />
                  )}
                </Button>
              )}
            </div>

            {/* Sign in buttons */}
            <div
              className="pr-2 pl-1"
              style={{
                // marginLeft: '-5px',
                position: 'relative',
                top: '-2px',
                justifyContent: 'flex-center',
              }}
            >
              <AuthMenu />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default ChatNavbar
