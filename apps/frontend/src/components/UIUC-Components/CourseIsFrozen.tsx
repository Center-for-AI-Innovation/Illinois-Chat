import React from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { Button } from '@/components/shadcn/ui/button'
import { montserrat_heading } from 'fonts'

const buttonClassName =
  'login-btn h-auto min-h-12 bg-(--button) text-white hover:bg-(--button-hover)'

export const CourseIsFrozen = ({ course_name }: { course_name: string }) => {
  return (
    <>
      <Head>
        <title>Chatbot temporarily frozen — Illinois Chat</title>
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
              {course_name} is temporarily frozen
            </h2>
            <p
              className={`${montserrat_heading.variable} font-montserratHeading max-w-2xl p-4 text-center text-lg text-(--foreground)`}
            >
              An administrator has temporarily frozen this chatbot, so its
              settings can&apos;t be opened right now. Contact the Illinois Chat
              team if you think this is a mistake.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Link href="/chatbots">
                <Button
                  className={buttonClassName}
                  style={{ fontSize: '24px' }}
                >
                  My Chatbots →
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
