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

2. Please create a new script inthe v2 directory that is similar to v1 in that it searches for company names in the f5500 datasets, but with these differences:
    2a. It takes a .csv file of company names instead of a single one. 
    2b. After printing the key values for each record, it summarizes the results at the bottom. The summary includes:
        2b.1 For each company name, was it an unambiguous match, in that all the records have the same sponsor name?
        2b.2 For each company name, was it an ambiguous match, in that there are multiple sponsor names in the records, indicating that the company name we searched for matched with more than one company, and we don't know which is the intended match?
        2b.3 For each company, indicate whether no matches were found. 
    2c. For example, if the contents of the .csv file is: "Acme Incorporated, Infinity Ward, Bazoo", the results will look like this:
        <actual record results for Acme Incorporated, Infinity Ward, Bazoo listed here>
        Acme Incorporated: unambiguous match - all records match
        Infinity Ward: ambiguous match - three different sponsors found amongst 11 records
        Bazoo: not found
        Total: 
            33% unambiguous
            33% ambiguous
            33% not found