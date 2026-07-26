We want to build our very own proton, not all of it's services but some of the important ones, the ones I use the most.
I primarily use services like "pass" and "mail".
I like the idea of ephemeral emails that I can use and throw and not trace back to me and a login service that is really good at securing password.
I want to start with a normal secure secrets saving website and a mobile application and then move on to the mailing and how to create my own short lived emails that can't be traced back to me.
Also if possible I want to introduce a terminal surface as well but later.
--
The idea of the pass application is very simple:
- I am able to save important secrets securely which are decrypted on frontend and we don't carry over secrets.
- Do not trust anyone or anything.
- I can save different type of secrets, logins, emails, 2fa codes, backup codes, addresses, Cards, bank details, json blobs, identity
- I also want to be able to create an extension for all browser types so I can use it easily as well if possible -- but this is for future.
- Also a secure way to get a dump or upload a dump to it as well.
- We'll start with website and then move on to phone application (android and then ios) -- or if androids and iphones allow website to be used as an app itself.

The idea behind email:
- Basic email yes
- But I also want to be able to bring in my own domains as well and use them securely.
- I want to be able to create my own emails for my domains
- And then I also want to be able to auto generate emails, that basically work as a forwarder; which doesn't leak my original email plus I can delete anytime.




