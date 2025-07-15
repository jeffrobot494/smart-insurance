from mcp.server.fastmcp import FastMCP, Context
from openai import OpenAI
import json

# Create an MCP server
mcp = FastMCP("PerplexitySearch")

# Perplexity API key
PERPLEXITY_API_KEY = "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"

# Initialize OpenAI client with Perplexity base URL
client = OpenAI(api_key=PERPLEXITY_API_KEY, base_url="https://api.perplexity.ai")

@mcp.tool()
def search_web(query: str, model: str = "sonar-pro") -> str:
    """
    Search the web for current information using Perplexity AI.
    
    Args:
        query: The search query to send to Perplexity
        model: The Perplexity model to use (default: sonar-pro)
              Options: sonar-pro, sonar-small, sonar-medium, codellama-70b, mistral-7b
        
    Returns:
        The search results from Perplexity
    """
    # Ensure model is a valid option
    valid_models = ["sonar-pro", "sonar-small", "sonar-medium", "codellama-70b", "mistral-7b"]
    if model not in valid_models:
        model = "sonar-pro"  # Default to best model if invalid

    # Enhance the system prompt for better search results
    system_prompt = """
    You are an expert web search assistant that provides accurate, up-to-date information.
    Use your web search capability to find the most current information available.
    Always include relevant details like dates, numbers, and facts.
    For sports scores, include the teams, final score, and date of the game.
    For news, include the publication date and source when available.
    Be concise but thorough, focusing on answering exactly what was asked.
    """
    
    messages = [
        {
            "role": "system",
            "content": system_prompt
        },
        {
            "role": "user",
            "content": query
        }
    ]
    
    try:
        # Make a request to Perplexity API
        response = client.chat.completions.create(
            model=model,
            messages=messages,
        )
        
        # Extract the response content
        result = response.choices[0].message.content
        
        # Format citations if available
        if hasattr(response, 'citations') and response.citations:
            result += "\n\nSources:\n"
            for i, citation in enumerate(response.citations, 1):
                result += f"{i}. {citation}\n"
        
        # Include model information
        result += f"\n\n(Results from Perplexity {model})"
                
        return result
    
    except Exception as e:
        error_message = str(e)
        # Log the error for debugging
        print(f"Perplexity API Error: {error_message}")
        
        # Provide a user-friendly error message
        if "authentication" in error_message.lower():
            return "Error: Authentication failed. Please check the API key."
        elif "rate limit" in error_message.lower():
            return "Error: Rate limit exceeded. Please try again later."
        elif "timeout" in error_message.lower():
            return "Error: The request timed out. Please try again."
        else:
            return f"Error searching with Perplexity: {error_message}"

@mcp.tool()
def search_image(query: str) -> str:
    """
    Search the web for information about an image or visual topic using Perplexity AI.
    
    Args:
        query: The image search query to send to Perplexity
        
    Returns:
        Information about the requested visual topic
    """
    system_prompt = """
    You are an expert visual information assistant.
    Provide detailed information about the requested image or visual topic.
    Include descriptions, context, history, and relevant facts.
    For art or photos, include artist, style, time period, and visual details when available.
    For diagrams or charts, explain what they represent in detail.
    """
    
    messages = [
        {
            "role": "system",
            "content": system_prompt
        },
        {
            "role": "user",
            "content": f"I need detailed information about this visual topic: {query}"
        }
    ]
    
    try:
        response = client.chat.completions.create(
            model="sonar-pro",
            messages=messages,
        )
        
        result = response.choices[0].message.content
        
        if hasattr(response, 'citations') and response.citations:
            result += "\n\nSources:\n"
            for i, citation in enumerate(response.citations, 1):
                result += f"{i}. {citation}\n"
                
        return result
    
    except Exception as e:
        error_message = str(e)
        print(f"Perplexity API Error: {error_message}")
        return f"Error searching for image information: {error_message}"

@mcp.tool()
def ask_factual_question(question: str) -> str:
    """
    Ask a specific factual question and get a concise, accurate answer.
    
    Args:
        question: The factual question to ask
        
    Returns:
        A concise factual answer
    """
    system_prompt = """
    You are a factual question answering system. Provide short, accurate answers to factual questions.
    Prioritize brevity, accuracy, and citing sources when possible.
    For numbers, statistics, and factual claims, provide the most up-to-date information available.
    """
    
    messages = [
        {
            "role": "system",
            "content": system_prompt
        },
        {
            "role": "user",
            "content": question
        }
    ]
    
    try:
        response = client.chat.completions.create(
            model="sonar-pro",
            messages=messages,
        )
        
        result = response.choices[0].message.content
        
        if hasattr(response, 'citations') and response.citations:
            result += "\n\nSources:\n"
            for i, citation in enumerate(response.citations, 1):
                result += f"{i}. {citation}\n"
                
        return result
    
    except Exception as e:
        error_message = str(e)
        print(f"Perplexity API Error: {error_message}")
        return f"Error answering factual question: {error_message}"

@mcp.resource("help://search")
def get_help() -> str:
    """
    Provide help information about the Perplexity search tools.
    """
    return """
    # Perplexity Search Tools
    
    This MCP server provides several tools to search the web for current information using Perplexity AI.
    
    ## Available Tools
    
    ### 1. search_web
    Search the web for current information on any topic.
    
    ```python
    search_web("What are the latest NBA scores?")
    search_web("Current weather in New York", model="sonar-medium")
    ```
    
    Available models: sonar-pro (default), sonar-small, sonar-medium, codellama-70b, mistral-7b
    
    ### 2. search_image
    Search for detailed information about a visual topic.
    
    ```python
    search_image("The Mona Lisa painting")
    search_image("How does a nuclear reactor work?")
    ```
    
    ### 3. ask_factual_question
    Get concise answers to specific factual questions.
    
    ```python
    ask_factual_question("What is the population of Tokyo?")
    ask_factual_question("When was the first iPhone released?")
    ```
    
    ## Tips for Best Results
    
    - Be specific in your queries for more accurate results
    - Include relevant keywords and specific questions
    - For sports scores, include team names and timeframe
    - For news, mention the topic and recency (e.g., "latest news on...")
    """

if __name__ == "__main__":
    mcp.run()