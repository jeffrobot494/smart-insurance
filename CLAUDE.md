
Read the files at "./server/docs"

Read "./server.js", "./Manager.js", "./server/workflow/WorkFlowManager.js", "./server/workflow/TaskExecution.js", "./server/routes/workflow.js"

Now, the run() function in Manager.js completes a workflow, assumes the output is a list of portfolio companies names, and then calls the data extraction method to pull results from out form 5500 database with results for companies with those exact names. 

In "./server/routes/testing/" we've been testing a new workflow that takes the portfolio company names and transforms it into the legal entity names that are found in the database, for each company, so that the data extraction is better. 

We need to refactor Manager.js to decouple the workflow completion from the data extraction. Run() should just run a given workflow and return the results. Then we'll set it up so that, on request from the client, we will run the first workflow to get the names, then the second to refine them, then 
we'll call data extraction on the refined list of names. Give me an outline for how you would do this refactor. Keep it simple, and follow existing patterns. Think through it step by step.