import React from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { Button } from '@/components/shadcn/ui/button'
import { montserrat_heading } from 'fonts'
import { buildProjectChatPath } from '~/utils/projectName'

const buttonClassName =
  'login-btn h-auto min-h-12 bg-(--button) text-white hover:bg-(--button-hover)'

export const CannotEditCourse = ({ course_name }: { course_name: string }) => {
  return (
    <>
      <Head>
        <title>No permission to manage this chatbot — Illinois Chat</title>
      </Head>
      <main
        id="main-content"
        tabIndex={-1}
        className="course-page-main flex min-h-screen flex-col items-center justify-center"
      >
        <div className="container flex flex-col items-center justify-center gap-8 px-4 py-8">
          <Link href="/">
            <h1
              className={`text-5xl font-extrabold tracking-tight text-white sm:text-[5rem] ${montserrat_heading.variable} font-montserratHeading`}
            >
              <span className="mr-2 text-(--illinois-orange)">Illinois</span>
              <span className="text-(--foreground)">Chat</span>
            </h1>
          </Link>
        </div>
        <div className="items-left container flex flex-col justify-center gap-2 py-0">
          <div className="flex flex-col items-center justify-center">
            <h2
              className={`${montserrat_heading.variable} font-montserratHeading p-8 text-center text-4xl font-bold text-(--foreground)`}
            >
              You don&apos;t have permission to manage this chatbot
            </h2>
            <p
              className={`${montserrat_heading.variable} font-montserratHeading max-w-2xl p-4 text-center text-lg text-(--foreground)`}
            >
              Only the chatbot&apos;s owner and admins can open its settings.
              Ask the owner to add you as an admin, or sign in with a different
              account.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Link href={buildProjectChatPath(course_name)}>
                <Button
                  className={buttonClassName}
                  style={{ fontSize: '24px' }}
                >
                  Go to chatbot
                </Button>
              </Link>
              <Link href="/new">
                <Button
                  className={buttonClassName}
                  style={{ fontSize: '24px' }}
                >
                  Create your own chatbot
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
