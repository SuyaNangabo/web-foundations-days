# Reflection

The most difficult concept in the course was asynchronous JavaScript, especially how fetch behaves. I expected a 404 or 500 response to throw an error, but fetch only fails when the network fails, so my code treated server errors as successes. I overcame this by building my API client in small steps and testing every failure in DevTools by going offline and using a wrong URL. Then I wrote one reusable request() function that checks response.ok, and wrapped each call in try, catch and finally. Once I could see the errors happen, the idea finally made sense.

The feedback I received was that a design document I submitted stopped mid-sentence and was missing required sections: component descriptions, the upload flow and the trade-offs. That taught me that I was not checking my work from start to finish before pushing it.

For my capstone, I would improve two things. First, I would read every file to the last line and preview it before every push. Second, I would connect my API client to a real backend with a real database, instead of the fake JSONPlaceholder API, so that creating and deleting notes truly saves data.

Next, I will learn Node.js and Express, then build my own API on PostgreSQL by following the designs I wrote. For me, I need to practise more SQL using Kaggle and also more python on edX. After that I want to learn authentication, automated testing and deployment, so I can build and launch complete projects as a freelance developer.
