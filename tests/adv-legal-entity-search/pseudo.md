#BRAINSTORMING#
1. Connect to the database and make sql calls instead of actually reading the csv files.
2. We will use a series of subscripts
3. The company object looks like:
{
    "name": company_name,
    "legal-entity": legal_entity_name,
    "zip-code": zip_code,
    "years": []
}

1. Read in the list of company_names
2. Convert them to their json objects
3. Use perplexity to get their zip codes
4. Pass them all to company_search(), which finds them by name and zip code, 
5. This looks for their name first, then a series of fuzzy matching names.
6. If any still have no years, we do perplexity search for legal entity name. 

Good perplexity search for legal entity is "What is the legal entity DBA <company_name>?"

#BUILDING#

1. Please create a new directory called "v2". Inside it, write a script that:
    1a. Reads the first column of a csv file into a javascript object that will be structured as detailed in BRAINSTORMING.3.
    2a. Starting with the second element in the list, increments through the list and makes a call to the perplexity sonar API with the following message:
        "Please find the zip code of the company <company>, which is a portfolio company of the private equity firm <firm>. Return ONLY the zip code in your response - no commentary."
    3a. Replaces <firm> with the first element of the list and replaces <company> with the iterator's index in the list.
    4a. My perplexity API key is "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"
    5a. Logs the final list of company objects.

Bad news: The same company, when logging different plans, can use two different zip codes. So having a single zip code per company doesn't even work. 

So, we will get the "legal entity DBA <company_name>, the portfolio company of <firm_name>."